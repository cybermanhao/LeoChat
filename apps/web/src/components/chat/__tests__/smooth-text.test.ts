import { describe, expect, it } from "vitest";
import { nextShownLength } from "../turn/useSmoothText";

/** 流式正文平滑：每次至少前进 1 个字，积压越多步子越大，约 10 次更新追平 */
describe("nextShownLength", () => {
  it("advances at least one character", () => {
    expect(nextShownLength(0, 1)).toBe(1);
    expect(nextShownLength(5, 7)).toBe(6);
  });
  it("takes bigger steps for a bigger backlog, catching up in about ten ticks", () => {
    expect(nextShownLength(0, 200)).toBe(20);
    let n = 0;
    let ticks = 0;
    while (n < 200) {
      n = nextShownLength(n, 200);
      ticks++;
    }
    expect(ticks).toBeLessThanOrEqual(40);
  });
  it("never goes past the text", () => {
    expect(nextShownLength(10, 10)).toBe(10);
    expect(nextShownLength(12, 10)).toBe(10);
  });
});
