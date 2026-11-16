import { describe, it, expect, vi, afterEach } from "vitest";
import { withRetry } from "../retry.js";

describe("withRetry", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("成功时直接返回结果，不重试", async () => {
    const op = vi.fn().mockResolvedValue("ok");
    const result = await withRetry(op);
    expect(result).toBe("ok");
    expect(op).toHaveBeenCalledTimes(1);
  });

  it("retryable 错误（503）会重试直到成功", async () => {
    const op = vi
      .fn()
      .mockRejectedValueOnce(new Error("503 service unavailable"))
      .mockResolvedValue("ok");

    const result = await withRetry(op, { maxAttempts: 3, initialDelayMs: 0, jitter: false });
    expect(result).toBe("ok");
    expect(op).toHaveBeenCalledTimes(2);
  });

  it("非 retryable 错误（404）立即抛出，不重试", async () => {
    const op = vi.fn().mockRejectedValue(new Error("404 not found"));
    await expect(withRetry(op, { maxAttempts: 3, initialDelayMs: 0 })).rejects.toThrow("404");
    expect(op).toHaveBeenCalledTimes(1);
  });

  it("AbortError 立即抛出，不重试", async () => {
    const abortError = new DOMException("Aborted", "AbortError");
    const op = vi.fn().mockRejectedValue(abortError);
    const err = await withRetry(op).catch((e: unknown) => e);
    expect((err as Error).name).toBe("AbortError");
    expect(op).toHaveBeenCalledTimes(1);
  });

  it("所有重试耗尽后抛出最后一个错误", async () => {
    const op = vi.fn().mockRejectedValue(new Error("503 unavailable"));
    await expect(
      withRetry(op, { maxAttempts: 2, initialDelayMs: 0, jitter: false })
    ).rejects.toThrow("503 unavailable");
    expect(op).toHaveBeenCalledTimes(2);
  });

  it("onRetry 回调在每次重试前被调用", async () => {
    const op = vi
      .fn()
      .mockRejectedValueOnce(new Error("503 error"))
      .mockResolvedValue("ok");
    const onRetry = vi.fn();

    await withRetry(op, { maxAttempts: 3, initialDelayMs: 0, jitter: false }, onRetry);
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onRetry).toHaveBeenCalledWith(expect.objectContaining({ attempt: 1 }));
  });

  it("父 AbortSignal 触发时立即终止", async () => {
    const controller = new AbortController();
    controller.abort(); // 提前 abort

    const op = vi.fn().mockResolvedValue("ok");
    const err = await withRetry(op, {}, undefined, controller.signal).catch((e: unknown) => e);
    expect((err as Error).name).toBe("AbortError");
  });
});
