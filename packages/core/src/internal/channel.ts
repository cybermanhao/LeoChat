/**
 * 单消费者的异步事件通道：生产方 push，消费方 for await。
 * 没人消费时事件先缓存；close() 之后迭代结束。
 */
export class EventChannel<T> implements AsyncIterable<T> {
  private buffer: T[] = [];
  private waiters: Array<(r: IteratorResult<T>) => void> = [];
  private closed = false;

  push(value: T): void {
    if (this.closed) return;
    const waiter = this.waiters.shift();
    if (waiter) waiter({ value, done: false });
    else this.buffer.push(value);
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    for (const w of this.waiters.splice(0)) w({ value: undefined, done: true });
  }

  [Symbol.asyncIterator](): AsyncIterator<T> {
    return {
      next: (): Promise<IteratorResult<T>> => {
        const value = this.buffer.shift();
        if (value !== undefined) return Promise.resolve({ value, done: false });
        if (this.closed) return Promise.resolve({ value: undefined, done: true });
        return new Promise((resolve) => this.waiters.push(resolve));
      },
      return: (): Promise<IteratorResult<T>> => {
        // 消费方提前退出（break）不影响运行本身，只是不再接收事件
        return Promise.resolve({ value: undefined, done: true });
      },
    };
  }
}

/** 可被 AbortSignal 打断的 sleep */
export function abortableSleep(ms: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.reject(signal.reason);
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal.reason);
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

/** 派生一个子 AbortController：父 signal 中止时子也中止 */
export function childController(parent: AbortSignal): AbortController {
  const ac = new AbortController();
  if (parent.aborted) ac.abort(parent.reason);
  else parent.addEventListener("abort", () => ac.abort(parent.reason), { once: true });
  return ac;
}
