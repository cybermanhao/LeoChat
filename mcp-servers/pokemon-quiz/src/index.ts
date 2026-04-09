import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

// ============================================================================
// Types
// ============================================================================

interface PokemonData {
  id: number;
  nameZh: string;
  nameEn: string;
  nameJa: string;
  types: string[];
  sprite: string;
  genusZh: string;
  genusEn: string;
  genusJa: string;
  generation: number;
  height: number; // dm
  weight: number; // hg
}

interface QuizSession {
  lang: "zh" | "en" | "ja";
  difficulty: "easy" | "normal" | "hard";
  currentPokemon: PokemonData;
  options: string[];
  score: number;
  round: number;
  totalRounds: number;
  answered: boolean;
}

// ============================================================================
// i18n
// ============================================================================

const i18n = {
  zh: {
    quizTitle: "猜猜这是谁？",
    easySubtitle: "看图猜宝可梦",
    normalSubtitle: "根据提示猜宝可梦",
    hardSubtitle: "困难模式 · 最少提示",
    type: "属性",
    gen: "世代",
    genValue: (n: number) => `第 ${n} 世代`,
    category: "分类",
    typeCount: "属性数",
    height: "身高",
    weight: "体重",
    heightValue: (h: number) => `${(h / 10).toFixed(1)} m`,
    weightValue: (w: number) => `${(w / 10).toFixed(1)} kg`,
    roundBadge: (cur: number, total: number) => `第 ${cur}/${total} 题`,
    progress: (cur: number, total: number) => `进度 ${cur}/${total}`,
    scoreBadge: (s: number, r: number) => `当前得分: ${s}/${r}`,
    correct: "回答正确！",
    wrong: "答错了…",
    correctAnswer: "正确答案",
    yourAnswer: "你的回答",
    hwLabel: "身高/体重",
    hwValue: (h: number, w: number) => `${(h / 10).toFixed(1)}m / ${(w / 10).toFixed(1)}kg`,
    scoreLabel: (s: number, r: number) => `得分: ${s}/${r}`,
    gameOver: (s: number, t: number) => `游戏结束！最终得分: **${s}/${t}**`,
    nextBtn: "下一题 ▶",
    restartBtn: "再来一局",
    // 关键：告诉 LLM 不要自答
    llmInstruction: "【系统指令】请直接展示上方卡片给用户，不要分析选项或透露答案。让用户自己点击按钮作答。",
    llmResultInstruction: "【系统指令】请简短评论结果（不要重复卡片内容），如果有「下一题」按钮，提示用户点击继续。",
  },
  en: {
    quizTitle: "Who's that Pokémon?",
    easySubtitle: "Guess from image",
    normalSubtitle: "Guess from hints",
    hardSubtitle: "Hard mode · minimal hints",
    type: "Type",
    gen: "Generation",
    genValue: (n: number) => `Gen ${n}`,
    category: "Category",
    typeCount: "# of Types",
    height: "Height",
    weight: "Weight",
    heightValue: (h: number) => `${(h / 10).toFixed(1)} m`,
    weightValue: (w: number) => `${(w / 10).toFixed(1)} kg`,
    roundBadge: (cur: number, total: number) => `Q${cur}/${total}`,
    progress: (cur: number, total: number) => `Progress ${cur}/${total}`,
    scoreBadge: (s: number, r: number) => `Score: ${s}/${r}`,
    correct: "Correct!",
    wrong: "Wrong…",
    correctAnswer: "Answer",
    yourAnswer: "Your guess",
    hwLabel: "Height/Weight",
    hwValue: (h: number, w: number) => `${(h / 10).toFixed(1)}m / ${(w / 10).toFixed(1)}kg`,
    scoreLabel: (s: number, r: number) => `Score: ${s}/${r}`,
    gameOver: (s: number, t: number) => `Game over! Final score: **${s}/${t}**`,
    nextBtn: "Next ▶",
    restartBtn: "Play again",
    llmInstruction: "[System] Present the card above to the user. Do NOT analyze the options or reveal the answer. Let the user click a button to answer.",
    llmResultInstruction: "[System] Briefly comment on the result (don't repeat card content). If there's a Next button, prompt the user to click it.",
  },
  ja: {
    quizTitle: "だーれだ？",
    easySubtitle: "画像からポケモンを当てよう",
    normalSubtitle: "ヒントからポケモンを当てよう",
    hardSubtitle: "ハードモード · ヒント最小",
    type: "タイプ",
    gen: "世代",
    genValue: (n: number) => `第${n}世代`,
    category: "分類",
    typeCount: "タイプ数",
    height: "高さ",
    weight: "重さ",
    heightValue: (h: number) => `${(h / 10).toFixed(1)} m`,
    weightValue: (w: number) => `${(w / 10).toFixed(1)} kg`,
    roundBadge: (cur: number, total: number) => `第${cur}/${total}問`,
    progress: (cur: number, total: number) => `進行 ${cur}/${total}`,
    scoreBadge: (s: number, r: number) => `スコア: ${s}/${r}`,
    correct: "正解！",
    wrong: "不正解…",
    correctAnswer: "正解",
    yourAnswer: "あなたの回答",
    hwLabel: "高さ/重さ",
    hwValue: (h: number, w: number) => `${(h / 10).toFixed(1)}m / ${(w / 10).toFixed(1)}kg`,
    scoreLabel: (s: number, r: number) => `スコア: ${s}/${r}`,
    gameOver: (s: number, t: number) => `ゲーム終了！最終スコア: **${s}/${t}**`,
    nextBtn: "次の問題 ▶",
    restartBtn: "もう一回",
    llmInstruction: "【システム指示】上のカードをユーザーに表示してください。選択肢を分析したり答えを明かしたりしないでください。ユーザーにボタンをクリックさせてください。",
    llmResultInstruction: "【システム指示】結果を簡潔にコメントしてください（カードの内容を繰り返さないで）。「次の問題」ボタンがある場合、ユーザーにクリックを促してください。",
  },
};

type Lang = keyof typeof i18n;

// ============================================================================
// Pokemon type names per language
// ============================================================================

const typeNames: Record<Lang, Record<string, string>> = {
  zh: {
    normal: "一般", fire: "火", water: "水", electric: "电", grass: "草",
    ice: "冰", fighting: "格斗", poison: "毒", ground: "地面", flying: "飞行",
    psychic: "超能力", bug: "虫", rock: "岩石", ghost: "幽灵", dragon: "龙",
    dark: "恶", steel: "钢", fairy: "妖精",
  },
  en: {
    normal: "Normal", fire: "Fire", water: "Water", electric: "Electric", grass: "Grass",
    ice: "Ice", fighting: "Fighting", poison: "Poison", ground: "Ground", flying: "Flying",
    psychic: "Psychic", bug: "Bug", rock: "Rock", ghost: "Ghost", dragon: "Dragon",
    dark: "Dark", steel: "Steel", fairy: "Fairy",
  },
  ja: {
    normal: "ノーマル", fire: "ほのお", water: "みず", electric: "でんき", grass: "くさ",
    ice: "こおり", fighting: "かくとう", poison: "どく", ground: "じめん", flying: "ひこう",
    psychic: "エスパー", bug: "むし", rock: "いわ", ghost: "ゴースト", dragon: "ドラゴン",
    dark: "あく", steel: "はがね", fairy: "フェアリー",
  },
};

// ============================================================================
// PokeAPI helpers
// ============================================================================

function getPokemonName(p: PokemonData, lang: Lang): string {
  switch (lang) {
    case "zh": return p.nameZh;
    case "en": return p.nameEn;
    case "ja": return p.nameJa;
  }
}

async function fetchPokemonData(id: number): Promise<PokemonData | null> {
  try {
    const [pokemonRes, speciesRes] = await Promise.all([
      fetch(`https://pokeapi.co/api/v2/pokemon/${id}`),
      fetch(`https://pokeapi.co/api/v2/pokemon-species/${id}`),
    ]);
    if (!pokemonRes.ok || !speciesRes.ok) return null;

    const pokemon = await pokemonRes.json() as {
      types: Array<{ type: { name: string } }>;
      sprites: { other: { "official-artwork": { front_default: string } } };
      height: number;
      weight: number;
    };
    const species = await speciesRes.json() as {
      names: Array<{ language: { name: string }; name: string }>;
      genera: Array<{ language: { name: string }; genus: string }>;
      generation: { url: string };
    };

    const findName = (lang: string) =>
      species.names.find((n) => n.language.name === lang)?.name || "";
    const findGenus = (lang: string) =>
      species.genera.find((g) => g.language.name === lang)?.genus || "";

    const nameZh = findName("zh-hans") || findName("zh-hant") || findName("en");
    const nameEn = findName("en") || "???";
    const nameJa = findName("ja") || findName("ja-Hrkt") || nameEn;

    const genusZh = findGenus("zh-hans") || findGenus("zh-hant") || findGenus("en");
    const genusEn = findGenus("en");
    const genusJa = findGenus("ja") || findGenus("ja-Hrkt") || genusEn;

    const genMatch = species.generation.url.match(/\/(\d+)\//);

    return {
      id,
      nameZh,
      nameEn,
      nameJa,
      types: pokemon.types.map((t) => t.type.name),
      sprite: pokemon.sprites.other["official-artwork"].front_default
        || `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${id}.png`,
      genusZh,
      genusEn,
      genusJa,
      generation: genMatch ? parseInt(genMatch[1]) : 1,
      height: pokemon.height,
      weight: pokemon.weight,
    };
  } catch {
    return null;
  }
}

async function fetchRandomPokemon(count: number, excludeId?: number): Promise<PokemonData[]> {
  const maxId = 649; // Gen 1-5
  const results: PokemonData[] = [];
  const usedIds = new Set(excludeId ? [excludeId] : []);
  let attempts = 0;

  while (results.length < count && attempts < count * 3) {
    attempts++;
    let id: number;
    do { id = Math.floor(Math.random() * maxId) + 1; } while (usedIds.has(id));
    usedIds.add(id);
    const data = await fetchPokemonData(id);
    if (data) results.push(data);
  }
  return results;
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function getGenus(p: PokemonData, lang: Lang): string {
  switch (lang) {
    case "zh": return p.genusZh;
    case "en": return p.genusEn;
    case "ja": return p.genusJa;
  }
}

// ============================================================================
// Quiz state
// ============================================================================

const quizSessions = new Map<string, QuizSession>();

// Clean up old sessions (older than 30 min)
setInterval(() => {
  const now = Date.now();
  for (const [key] of quizSessions) {
    const ts = parseInt(key.split("_")[1] || "0");
    if (now - ts > 30 * 60 * 1000) quizSessions.delete(key);
  }
}, 5 * 60 * 1000);

// ============================================================================
// Card builders
// ============================================================================

function buildQuestionCard(
  session: QuizSession,
  sessionId: string,
): object {
  const t = i18n[session.lang];
  const tn = typeNames[session.lang];
  const p = session.currentPokemon;

  const hints: Array<{ label: string; value: string }> = [];

  if (session.difficulty !== "hard") {
    hints.push({ label: t.type, value: p.types.map((tp) => tn[tp] || tp).join(" / ") });
    hints.push({ label: t.gen, value: t.genValue(p.generation) });
  }
  if (session.difficulty === "hard") {
    hints.push({ label: t.typeCount, value: `${p.types.length}` });
    hints.push({ label: t.height, value: t.heightValue(p.height) });
    hints.push({ label: t.weight, value: t.weightValue(p.weight) });
  }
  const genus = getGenus(p, session.lang);
  if (genus) {
    hints.push({ label: t.category, value: genus });
  }

  const body: unknown[] = [];
  if (session.difficulty === "easy") {
    body.push({ type: "image", image: { url: p.sprite, alt: "Who's that Pokémon?" } });
  }
  body.push({ type: "fields", fields: hints });

  if (session.round > 1) {
    body.push({ type: "progress", progress: { value: session.round - 1, max: session.totalRounds, label: t.progress(session.round, session.totalRounds) } });
    body.push({ type: "badge", badge: { text: t.scoreBadge(session.score, session.round - 1), tone: "info" } });
  } else {
    body.push({ type: "badge", badge: { text: t.roundBadge(session.round, session.totalRounds), tone: "info" } });
  }

  const subtitles = { easy: t.easySubtitle, normal: t.normalSubtitle, hard: t.hardSubtitle };

  return {
    id: `pq_${sessionId}_q${session.round}`,
    kind: "quiz",
    title: `🎮 ${t.quizTitle}`,
    subtitle: subtitles[session.difficulty],
    tone: "info",
    body,
    actions: session.options.map((opt, i) => ({
      id: `opt_${i}`,
      label: opt,
      kind: "secondary",
      action: {
        type: "ui-command",
        command: "send_message",
        payload: { text: `[pokemon_answer sessionId="${sessionId}" guess="${opt}"]` },
      },
    })),
  };
}

function buildAnswerCard(
  session: QuizSession,
  sessionId: string,
  guess: string,
  correct: boolean,
): object {
  const t = i18n[session.lang];
  const tn = typeNames[session.lang];
  const p = session.currentPokemon;
  const isLast = session.round >= session.totalRounds;

  const nameDisplay = session.lang === "en"
    ? p.nameEn
    : session.lang === "ja"
      ? `${p.nameJa} (${p.nameEn})`
      : `${p.nameZh} (${p.nameEn})`;

  const body: unknown[] = [
    { type: "image", image: { url: p.sprite, alt: getPokemonName(p, session.lang) } },
    {
      type: "fields",
      fields: [
        { label: t.correctAnswer, value: nameDisplay },
        { label: t.yourAnswer, value: guess },
        { label: t.type, value: p.types.map((tp) => tn[tp] || tp).join(" / ") },
        { label: t.category, value: getGenus(p, session.lang) || "-" },
        { label: t.hwLabel, value: t.hwValue(p.height, p.weight) },
      ],
    },
    { type: "badge", badge: { text: t.scoreLabel(session.score, session.round), tone: correct ? "success" : "default" } },
  ];

  const actions: unknown[] = [];

  if (isLast) {
    body.push({ type: "divider" });
    body.push({ type: "text", text: `🏆 ${t.gameOver(session.score, session.totalRounds)}`, format: "markdown" });
    actions.push({
      id: "restart",
      label: `${t.restartBtn} 🔄`,
      kind: "primary",
      action: {
        type: "ui-command",
        command: "send_message",
        payload: { text: `[pokemon_start rounds=${session.totalRounds} lang=${session.lang} difficulty=${session.difficulty}]` },
      },
    });
  } else {
    actions.push({
      id: "next",
      label: t.nextBtn,
      kind: "primary",
      action: {
        type: "ui-command",
        command: "send_message",
        payload: { text: `[pokemon_next sessionId="${sessionId}"]` },
      },
    });
  }

  return {
    id: `pq_${sessionId}_a${session.round}`,
    kind: "quiz",
    title: correct ? `✅ ${t.correct}` : `❌ ${t.wrong}`,
    tone: correct ? "success" : "error",
    body,
    actions,
  };
}

// ============================================================================
// MCP Server
// ============================================================================

const server = new Server(
  { name: "pokemon-quiz", version: "0.1.0" },
  { capabilities: { tools: {} } }
);

const TOOL_NOTE = "Returns a LeoCard. IMPORTANT: Present the card to the user WITHOUT analyzing options or revealing the answer.";

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "pokemon_start",
      description: `Start a new Pokémon quiz game. ${TOOL_NOTE}`,
      inputSchema: {
        type: "object",
        properties: {
          rounds: { type: "number", description: "Number of questions (default 5, max 20)" },
          difficulty: { type: "string", enum: ["easy", "normal", "hard"], description: "easy=image+hints, normal=hints only, hard=minimal hints" },
          lang: { type: "string", enum: ["zh", "en", "ja"], description: "Game language. Auto-detect from conversation if omitted." },
        },
      },
    },
    {
      name: "pokemon_answer",
      description: `Submit an answer to the current Pokémon quiz question. ${TOOL_NOTE}`,
      inputSchema: {
        type: "object",
        properties: {
          sessionId: { type: "string", description: "Game session ID" },
          guess: { type: "string", description: "The player's guess (Pokémon name)" },
        },
        required: ["sessionId", "guess"],
      },
    },
    {
      name: "pokemon_next",
      description: `Load the next question in the Pokémon quiz. ${TOOL_NOTE}`,
      inputSchema: {
        type: "object",
        properties: {
          sessionId: { type: "string", description: "Game session ID" },
        },
        required: ["sessionId"],
      },
    },
  ],
}));

const makeError = (msg: string) => ({
  content: [{ type: "text" as const, text: msg }],
  isError: true,
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  switch (name) {
    case "pokemon_start": {
      const { rounds = 5, difficulty = "easy", lang = "zh" } = (args ?? {}) as {
        rounds?: number;
        difficulty?: "easy" | "normal" | "hard";
        lang?: Lang;
      };
      const validLang: Lang = (["zh", "en", "ja"] as const).includes(lang as Lang) ? lang as Lang : "zh";

      const sid = `quiz_${Date.now()}`;
      const pokemon = await fetchPokemonData(Math.floor(Math.random() * 649) + 1);
      if (!pokemon) return makeError("Failed to fetch Pokémon data. Please retry.");

      const wrongOnes = await fetchRandomPokemon(3, pokemon.id);
      if (wrongOnes.length < 3) return makeError("Failed to fetch options. Please retry.");

      const options = shuffle([
        getPokemonName(pokemon, validLang),
        ...wrongOnes.map((p) => getPokemonName(p, validLang)),
      ]);

      const session: QuizSession = {
        lang: validLang,
        difficulty: difficulty || "easy",
        currentPokemon: pokemon,
        options,
        score: 0,
        round: 1,
        totalRounds: Math.min(Math.max(rounds, 1), 20),
        answered: false,
      };
      quizSessions.set(sid, session);

      return {
        content: [
          { type: "text" as const, text: JSON.stringify(buildQuestionCard(session, sid)) },
          { type: "text" as const, text: i18n[validLang].llmInstruction },
        ],
      };
    }

    case "pokemon_answer": {
      const { sessionId, guess } = (args ?? {}) as { sessionId?: string; guess?: string };
      if (!sessionId || !guess) return makeError("Missing sessionId or guess");

      const session = quizSessions.get(sessionId);
      if (!session) return makeError("Session expired or not found");
      if (session.answered) return makeError("Already answered. Click Next.");

      session.answered = true;
      const correct = guess === getPokemonName(session.currentPokemon, session.lang);
      if (correct) session.score++;

      const card = buildAnswerCard(session, sessionId, guess, correct);
      if (session.round >= session.totalRounds) quizSessions.delete(sessionId);

      return {
        content: [
          { type: "text" as const, text: JSON.stringify(card) },
          { type: "text" as const, text: i18n[session.lang].llmResultInstruction },
        ],
      };
    }

    case "pokemon_next": {
      const { sessionId } = (args ?? {}) as { sessionId?: string };
      if (!sessionId) return makeError("Missing sessionId");

      const session = quizSessions.get(sessionId);
      if (!session) return makeError("Session expired or not found");

      const pokemon = await fetchPokemonData(Math.floor(Math.random() * 649) + 1);
      if (!pokemon) return makeError("Failed to fetch Pokémon data. Please retry.");

      const wrongOnes = await fetchRandomPokemon(3, pokemon.id);
      if (wrongOnes.length < 3) return makeError("Failed to fetch options. Please retry.");

      session.currentPokemon = pokemon;
      session.options = shuffle([
        getPokemonName(pokemon, session.lang),
        ...wrongOnes.map((p) => getPokemonName(p, session.lang)),
      ]);
      session.round++;
      session.answered = false;

      return {
        content: [
          { type: "text" as const, text: JSON.stringify(buildQuestionCard(session, sessionId)) },
          { type: "text" as const, text: i18n[session.lang].llmInstruction },
        ],
      };
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
});

// ============================================================================
// Start
// ============================================================================

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Pokemon Quiz MCP Server running on stdio");
}

main().catch(console.error);
