import { describe, expect, it } from "vitest";
import { nextStick, STICK_THRESHOLD_PX } from "../useStickToBottom";

const el = (scrollTop: number, scrollHeight = 2000, clientHeight = 500) => ({ scrollTop, scrollHeight, clientHeight });

describe("nextStick", () => {
  it("near the bottom always sticks", () => {
    expect(nextStick({ stuck: false, lastTop: 0 }, el(1500))).toBe(true);
    expect(nextStick({ stuck: false, lastTop: 1600 }, el(1500 - STICK_THRESHOLD_PX))).toBe(true);
  });

  it("scrolling up away from the bottom unsticks", () => {
    expect(nextStick({ stuck: true, lastTop: 1500 }, el(1200))).toBe(false);
  });

  it("content growing below (scrollTop unchanged) keeps the current state", () => {
    // 内容变高：scrollHeight 变大、scrollTop 不变 → 不是用户滚动，保持贴底
    expect(nextStick({ stuck: true, lastTop: 1500 }, el(1500, 2600))).toBe(true);
    expect(nextStick({ stuck: false, lastTop: 800 }, el(800, 2600))).toBe(false);
  });

  it("scrolling down but not yet near the bottom keeps the current state", () => {
    expect(nextStick({ stuck: false, lastTop: 800 }, el(1000))).toBe(false);
  });
});
