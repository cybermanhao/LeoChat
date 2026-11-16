import { describe, expect, it } from "vitest";
import { loadSkillTool, run, skillCatalog, staticSkills, userMessage, type ToolResultBlock } from "../src/index";
import { scriptedProvider, textTurn, toolTurn } from "../src/testing/index";

const source = staticSkills([
  { name: "pdf", description: "Read and fill PDF forms.", content: "# PDF skill\nUse pdftk to fill forms." },
  { name: "contract-review", description: "Review   contracts\nclause by clause. ".repeat(20), content: "# Contract review\nCheck each clause." },
]);

describe("on-demand skills (dsh tool-skill style)", () => {
  it("builds a stable, sorted catalog with bounded descriptions", async () => {
    const catalog = skillCatalog(await source.list(), { descriptionMaxLength: 40 });
    const lines = catalog.split("\n");
    expect(lines[0]).toContain("load_skill");
    expect(lines[1]).toMatch(/^- contract-review: Review contracts clause by clause\./);
    expect(lines[1]!.length).toBeLessThanOrEqual("- contract-review: ".length + 40);
    expect(lines[2]).toBe("- pdf: Read and fill PDF forms.");
    // 同一组 skill，顺序不同也生成完全一样的目录（保护前缀缓存）
    expect(skillCatalog([...(await source.list())].reverse(), { descriptionMaxLength: 40 })).toBe(catalog);
    expect(skillCatalog([])).toBe("");
  });

  it("the model loads full instructions through the tool; unknown names list what exists", async () => {
    const provider = scriptedProvider([
      toolTurn([
        { id: "c1", name: "load_skill", args: { name: "pdf" } },
        { id: "c2", name: "load_skill", args: { name: "excel" } },
      ]),
      textTurn("ok"),
    ]);
    const r = await run({
      provider,
      model: "m",
      system: skillCatalog(await source.list()),
      messages: [userMessage("fill this form")],
      tools: [loadSkillTool(source)],
    }).result;
    const [ok, missing] = r.transcript[2]!.content as ToolResultBlock[];
    expect(ok!.content[0]).toMatchObject({ text: "# PDF skill\nUse pdftk to fill forms." });
    expect(missing).toMatchObject({ isError: true });
    expect((missing!.content[0] as { text: string }).text).toBe("Unknown skill: excel. Available skills: contract-review, pdf");
    expect(provider.requests[0]!.system).toContain("- pdf: Read and fill PDF forms.");
  });
});
