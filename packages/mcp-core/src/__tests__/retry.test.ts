import { describe, it, expect, vi, afterEach } from "vitest";
import { withRetry, CircuitBreaker } from "../retry.js";

// ─── CircuitBreaker ──────────────────────────────────────────────────────────

describe("CircuitBreaker", () => {
  it("初始状态为 closed，canAttempt 返回 true", () => {
    const cb = new CircuitBreaker();
    expect(cb.getState()).toBe("closed");
    expect(cb.canAttempt()).toBe(true);
  });

  it("失败次数达到阈值后转为 open", () => {
    const cb = new CircuitBreaker({ failureThreshold: 3 });
    cb.recordFailure();
    cb.recordFailure();
    expect(cb.getState()).toBe("closed");
    cb.recordFailure();
    expect(cb.getState()).toBe("open");
    expect(cb.canAttempt()).toBe(false);
  });

  it("open 状态超时后转为 half-open，允许一次尝试", () => {
    const cb = new CircuitBreaker({ failureThreshold: 1, resetTimeoutMs: 0 });
    cb.recordFailure();
    expect(cb.getState()).toBe("open");
    expect(cb.canAttempt()).toBe(true); // timeout elapsed → half-open
    expect(cb.getState()).toBe("half-open");
    expect(cb.canAttempt()).toBe(false); // 只允许一次
  });

  it("half-open 成功足够次数后恢复 closed", () => {
    const cb = new CircuitBreaker({ failureThreshold: 1, resetTimeoutMs: 0, successThreshold: 2 });
    cb.recordFailure();
    cb.canAttempt(); // → half-open
    cb.recordSuccess();
    expect(cb.getState()).toBe("half-open");
    cb.recordSuccess();
    expect(cb.getState()).toBe("closed");
  });

  it("half-open 失败立即重新 open", () => {
    const cb = new CircuitBreaker({ failureThreshold: 1, resetTimeoutMs: 0 });
    cb.recordFailure();
    cb.canAttempt(); // → half-open
    cb.recordFailure();
    expect(cb.getState()).toBe("open");
  });

  it("reset() 重置回 closed", () => {
    const cb = new CircuitBreaker({ failureThreshold: 1 });
    cb.recordFailure();
    expect(cb.getState()).toBe("open");
    cb.reset();
    expect(cb.getState()).toBe("closed");
    expect(cb.getFailureCount()).toBe(0);
  });

  it("onStateChange 回调在状态转换时被调用", () => {
    const onChange = vi.fn();
    const cb = new CircuitBreaker({ failureThreshold: 1 }, onChange);
    cb.recordFailure();
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ previousState: "closed", newState: "open" })
    );
  });
});

// ─── withRetry ───────────────────────────────────────────────────────────────
// 使用 initialDelayMs: 0 + jitter: false 避免依赖 fake timers

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
    const err = await withRetry(op).catch((e) => e);
    expect(err.name).toBe("AbortError");
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

    await withRetry(op, { maxAttempts: 3, initialDelayMs: 0, jitter: false }, undefined, onRetry);
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onRetry).toHaveBeenCalledWith(expect.objectContaining({ attempt: 1 }));
  });

  it("circuit breaker 在最后一次 retryable 失败时也记录（修复验证）", async () => {
    const cb = new CircuitBreaker({ failureThreshold: 2 });
    const op = vi.fn().mockRejectedValue(new Error("503 unavailable"));

    await expect(
      withRetry(op, { maxAttempts: 2, initialDelayMs: 0, jitter: false }, cb)
    ).rejects.toThrow();

    // maxAttempts=2，两次 503 失败都应被记录 → 触发 open
    expect(cb.getFailureCount()).toBe(2);
    expect(cb.getState()).toBe("open");
  });

  it("circuit breaker open 时直接抛出，不执行 operation", async () => {
    const cb = new CircuitBreaker({ failureThreshold: 1 });
    cb.recordFailure(); // 手动 open

    const op = vi.fn().mockResolvedValue("ok");
    await expect(withRetry(op, {}, cb)).rejects.toThrow("Circuit breaker is open");
    expect(op).not.toHaveBeenCalled();
  });

  it("父 AbortSignal 触发时立即终止", async () => {
    const controller = new AbortController();
    controller.abort(); // 提前 abort

    const op = vi.fn().mockResolvedValue("ok");
    const err = await withRetry(op, {}, undefined, undefined, controller.signal).catch((e) => e);
    expect(err.name).toBe("AbortError");
  });
});
