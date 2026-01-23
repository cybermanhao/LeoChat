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
  private cacheTimeout = 1000 * 60 * 5; // 5 minutes

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
      const response = await fetch(url, {
        method: "HEAD",
        headers: {
          "User-Agent": "AI-Chatbox-MCP/1.0",
        },
      });

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
    const response = await fetch(url, {
      headers: {
        "User-Agent": "AI-Chatbox-MCP/1.0",
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch image: ${response.status}`);
    }

    const contentType = response.headers.get("content-type") || "image/png";
    const arrayBuffer = await response.arrayBuffer();
    const data = Buffer.from(arrayBuffer);

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
    this.cache.set(url, metadata);
    // Auto-clean cache after timeout
    setTimeout(() => {
      this.cache.delete(url);
    }, this.cacheTimeout);
  }

  /**
   * Clear the cache
   */
  clearCache(): void {
    this.cache.clear();
  }
}
