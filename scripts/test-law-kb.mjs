/**
 * 法律知识库功能验证脚本
 * 用法: node scripts/test-law-kb.mjs
 */
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

// 加载 .env
const envPath = resolve(root, '.env');
const env = Object.fromEntries(
  readFileSync(envPath, 'utf-8')
    .split('\n')
    .filter(l => l.trim() && !l.startsWith('#'))
    .map(l => l.split('=').map(s => s.trim()))
    .filter(([k]) => k)
);

const { LeoAgent } = await import('../packages/leochat-sdk/dist/index.js');

const DEEPSEEK_KEY = env.DEEPSEEK_API_KEY;
const LAW_BUNDLE   = resolve(root, 'packages/law-kb-mcp/dist/bundle.mjs');
const PREBUILT_DB  = resolve(root, 'packages/law-kb-mcp/data/laws.db');
const MODEL_DIR    = resolve(root, 'packages/law-kb-mcp/data/model');

const QUESTIONS = [
  { id: 1, label: '竞业限制补偿标准',   q: '竞业限制协议中，未约定经济补偿标准时，劳动者能拿多少补偿？' },
  { id: 2, label: '股东优先购买权期限', q: '有限责任公司股东转让股权，其他股东有几天时间行使优先购买权？' },
  { id: 3, label: '对赌协议效力',       q: '投资方和目标公司直接签对赌协议，约定未达业绩就补偿投资方，这个条款有效吗？' },
  { id: 4, label: '保险解除权期限',     q: '保险公司发现投保人没有如实告知，但两个月后才通知解除合同，还能解除吗？' },
  { id: 5, label: '竞业限制综合推理',   q: '我签了竞业限制协议但公司一直没付补偿金，我还必须遵守吗？能直接去竞争对手那里上班吗？' },
  { id: 6, label: '居间跳单',           q: '房东和中介签了独家委托，买家绕开中介直接找房东成交，中介能要违约金吗？' },
  { id: 7, label: '格式条款无效',       q: '电商平台用户协议写了"概不退款"，消费者买了东西用不了，平台能拒绝退款吗？' },
  { id: 8, label: '商业秘密三要素',     q: '什么是商业秘密的三个认定要件？' },
];

// 颜色工具
const c = {
  bold:  s => `\x1b[1m${s}\x1b[0m`,
  green: s => `\x1b[32m${s}\x1b[0m`,
  red:   s => `\x1b[31m${s}\x1b[0m`,
  cyan:  s => `\x1b[36m${s}\x1b[0m`,
  gray:  s => `\x1b[90m${s}\x1b[0m`,
  yellow:s => `\x1b[33m${s}\x1b[0m`,
};

function hr() { console.log(c.gray('─'.repeat(70))); }

const agent = new LeoAgent();

agent.setLLM({
  provider: 'deepseek',
  apiKey: DEEPSEEK_KEY,
  model: 'deepseek-chat',
});

agent.addMCPServer('law-kb', {
  command: 'node',
  args: [LAW_BUNDLE],
  env: {
    LAW_PREBUILT_DB: PREBUILT_DB,
    LAW_MODEL_DIR:   MODEL_DIR,
  },
});

agent.setSystemPrompt(
  '你是一个专业的中国法律顾问。回答法律问题时，必须优先调用 search_law 和 search_case 工具检索知识库，' +
  '引用检索到的法条或判例支撑你的分析，不能仅凭训练数据作答。'
);

console.log(c.bold('\n⚖️  法律知识库功能验证'));
console.log(c.gray(`模型: deepseek-chat  MCP: law-kb-mcp  题目数: ${QUESTIONS.length}`));
hr();

const results = [];

for (const { id, label, q } of QUESTIONS) {
  console.log(c.bold(`\n[${id}/${QUESTIONS.length}] ${label}`));
  console.log(c.cyan('问题: ') + q);

  const t0 = Date.now();
  let result;
  try {
    result = await agent.ainvoke(q);
  } catch (e) {
    console.log(c.red('❌ 调用失败: ') + e.message);
    results.push({ id, label, ok: false, error: e.message });
    continue;
  }
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);

  // 工具调用摘要
  const toolCalls = result.toolCalls ?? [];
  if (toolCalls.length === 0) {
    console.log(c.yellow('⚠️  未触发任何工具调用'));
  } else {
    for (const tc of toolCalls) {
      const preview = JSON.stringify(tc.arguments).slice(0, 60);
      const dur = tc.duration ? ` (${(tc.duration/1000).toFixed(1)}s)` : '';
      const hasResult = tc.result != null;
      console.log(c.green('🔧 ') + c.bold(tc.name) + c.gray(` ${preview}…${dur}`) + (hasResult ? '' : c.red(' [无结果]')));
    }
  }

  // 回答截断展示
  const answer = (result.text ?? '').trim();
  const preview = answer.length > 300 ? answer.slice(0, 300) + '…' : answer;
  console.log(c.gray('\n答案: ') + preview);
  console.log(c.gray(`耗时 ${elapsed}s  tokens: ${result.usage?.input ?? 0}↑ ${result.usage?.output ?? 0}↓`));

  const ok = toolCalls.length > 0;
  results.push({ id, label, ok, toolCalls: toolCalls.map(t => t.name), elapsed });
}

await agent.disconnect();

// 汇总
hr();
console.log(c.bold('\n📊 测试汇总\n'));
let passed = 0;
for (const r of results) {
  if (r.error) {
    console.log(c.red(`  ✗ [${r.id}] ${r.label}`) + c.gray(' — 调用异常'));
  } else if (!r.ok) {
    console.log(c.yellow(`  △ [${r.id}] ${r.label}`) + c.gray(' — 未触发工具'));
  } else {
    passed++;
    const tools = [...new Set(r.toolCalls)].join(', ');
    console.log(c.green(`  ✓ [${r.id}] ${r.label}`) + c.gray(` — ${tools}  ${r.elapsed}s`));
  }
}
console.log(c.bold(`\n结果: ${passed}/${results.length} 触发了工具检索\n`));
