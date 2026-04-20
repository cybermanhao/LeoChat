export interface ImageMetadata {
  url: string;
  width?: number;
  height?: number;
  contentType: string;
  size: number;
  alt?: string;
  available: boolean;
  error?: string;
}

export interface ImageData {
  data: Buffer;
  contentType: string;
  size: number;
}

export class ImageProxyService {
  private cache: Map<string, ImageMetadata> = new Map();
  private cacheTimers: Map<string, NodeJS.Timeout> = new Map();
  private cacheTimeout = 1000 * 60 * 5; // 5 minutes
  private fetchTimeoutMs = 30000; // 30 seconds
  private maxCacheSize = 1000;
  private maxImageSize = 50 * 1024 * 1024; // 50MB

  /**
   * Get image metadata without downloading full image
   */
  async getMetadata(url: string): Promise<ImageMetadata> {
    // Check cache
    const cached = this.cache.get(url);
    if (cached) {
      return cached;
    }

    try {
      // Use HEAD request to get metadata
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.fetchTimeoutMs);
      let response: Response;
      try {
        response = await fetch(url, {
          method: "HEAD",
          headers: {
            "User-Agent": "AI-Chatbox-MCP/1.0",
          },
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timeoutId);
      }

      if (!response.ok) {
        const metadata: ImageMetadata = {
          url,
          contentType: "",
          size: 0,
          available: false,
          error: `HTTP ${response.status}: ${response.statusText}`,
        };
        this.cacheMetadata(url, metadata);
        return metadata;
      }

      const contentType = response.headers.get("content-type") || "";
      const contentLength = response.headers.get("content-length");

      // Check if it's an image
      if (!contentType.startsWith("image/")) {
        const metadata: ImageMetadata = {
          url,
          contentType,
          size: 0,
          available: false,
          error: "Not an image",
        };
        this.cacheMetadata(url, metadata);
        return metadata;
      }

      const metadata: ImageMetadata = {
        url,
        contentType,
        size: contentLength ? parseInt(contentLength, 10) : 0,
        available: true,
      };

      this.cacheMetadata(url, metadata);
      return metadata;
    } catch (error) {
      const metadata: ImageMetadata = {
        url,
        contentType: "",
        size: 0,
        available: false,
        error: error instanceof Error ? error.message : String(error),
      };
      this.cacheMetadata(url, metadata);
      return metadata;
    }
  }

  /**
   * Fetch full image data
   */
  async fetchImage(url: string): Promise<ImageData> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.fetchTimeoutMs);
    let response: Response;
    try {
      response = await fetch(url, {
        headers: {
          "User-Agent": "AI-Chatbox-MCP/1.0",
        },
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeoutId);
    }

    if (!response.ok) {
      throw new Error(`Failed to fetch image: ${response.status}`);
    }

    const contentType = response.headers.get("content-type") || "image/png";
    const contentLength = response.headers.get("content-length");
    if (contentLength) {
      const length = parseInt(contentLength, 10);
      if (!Number.isNaN(length) && length > this.maxImageSize) {
        throw new Error(`Image too large: ${length} bytes (max ${this.maxImageSize})`);
      }
    }

    // Stream read with hard byte limit
    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error("No response body");
    }
    const chunks: Uint8Array[] = [];
    let totalSize = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        totalSize += value.length;
        if (totalSize > this.maxImageSize) {
          throw new Error(`Image exceeds max size of ${this.maxImageSize} bytes`);
        }
        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }
    const data = Buffer.concat(chunks);

    return {
      data,
      contentType,
      size: data.length,
    };
  }

  /**
   * Get image as base64 data URL
   */
  async getAsDataUrl(url: string): Promise<string> {
    const { data, contentType } = await this.fetchImage(url);
    const base64 = data.toString("base64");
    return `data:${contentType};base64,${base64}`;
  }

  private cacheMetadata(url: string, metadata: ImageMetadata): void {
    // Enforce max cache size with LRU eviction
    if (this.cache.size >= this.maxCacheSize && !this.cache.has(url)) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey) {
        const oldTimer = this.cacheTimers.get(firstKey);
        if (oldTimer) clearTimeout(oldTimer);
        this.cache.delete(firstKey);
        this.cacheTimers.delete(firstKey);
      }
    }
    // Clear existing timer for this URL to prevent stale deletions
    const existingTimer = this.cacheTimers.get(url);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }
    this.cache.set(url, metadata);
    // Auto-clean cache after timeout
    const timer = setTimeout(() => {
      this.cache.delete(url);
      this.cacheTimers.delete(url);
    }, this.cacheTimeout);
    this.cacheTimers.set(url, timer);
  }

  /**
   * Clear the cache and all pending timers
   */
  clearCache(): void {
    for (const timer of this.cacheTimers.values()) {
      clearTimeout(timer);
    }
    this.cacheTimers.clear();
    this.cache.clear();
  }
}
