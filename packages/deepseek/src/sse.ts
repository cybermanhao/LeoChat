/** 最小的 SSE 解析器：把字节流切成 { event, data } 记录（只用 Web 标准 API） */

export interface SseRecord {
  event?: string;
  data: string;
}

export async function* parseSse(body: ReadableStream<Uint8Array>, signal?: AbortSignal): AsyncGenerator<SseRecord> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let event: string | undefined;
  let data: string[] = [];

  const flush = (): SseRecord | null => {
    if (data.length === 0) {
      event = undefined;
      return null;
    }
    const rec: SseRecord = { ...(event !== undefined ? { event } : {}), data: data.join("\n") };
    event = undefined;
    data = [];
    return rec;
  };

  try {
    for (;;) {
      signal?.throwIfAborted();
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let nl: number;
      while ((nl = buffer.indexOf("\n")) >= 0) {
        let line = buffer.slice(0, nl);
        buffer = buffer.slice(nl + 1);
        if (line.endsWith("\r")) line = line.slice(0, -1);
        if (line === "") {
          const rec = flush();
          if (rec) yield rec;
        } else if (line.startsWith(":")) {
          // 注释行（心跳）
        } else {
          const colon = line.indexOf(":");
          const field = colon < 0 ? line : line.slice(0, colon);
          let value2 = colon < 0 ? "" : line.slice(colon + 1);
          if (value2.startsWith(" ")) value2 = value2.slice(1);
          if (field === "event") event = value2;
          else if (field === "data") data.push(value2);
        }
      }
    }
    buffer += decoder.decode();
    if (buffer.trim() !== "") {
      for (const line of buffer.split("\n")) if (line.startsWith("data:")) data.push(line.slice(5).trimStart());
    }
    const rec = flush();
    if (rec) yield rec;
  } finally {
    reader.releaseLock();
  }
}
