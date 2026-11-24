import { describe, expect, it } from "vitest";
import { dockWidthFor } from "../RightDock";

/** 右栏宽度规则（dsh 的 ui-layout）：首开 45%，用户宽度，上限 70%，最小 300，对话区至少 400 */
describe("dockWidthFor", () => {
  it("opens at 45% of the viewport", () => {
    expect(dockWidthFor(1600, 1340, null)).toBe(720);
  });
  it("keeps the user's width, clamped to 300..70%", () => {
    expect(dockWidthFor(1600, 1340, 500)).toBe(500);
    expect(dockWidthFor(1600, 1340, 100)).toBe(300);
    expect(dockWidthFor(1600, 1600, 1500)).toBe(1120);
  });
  it("shrinks to leave the conversation 400px", () => {
    expect(dockWidthFor(1000, 760, null)).toBe(360);
  });
  it("returns null when even 300px would squeeze the conversation below 400px", () => {
    expect(dockWidthFor(800, 690, null)).toBeNull();
  });
});
