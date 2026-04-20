// 加载环境变量（必须在最顶部）
import { config } from "dotenv";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
// 从项目根目录加载 .env（向上三级：src -> server -> packages -> root）
config({ path: resolve(__dirname, "../../../.env") });

// Server exports
export * from "./server.js";
export * from "./routes/index.js";
export * from "./services/openrouter.js";
export * from "./services/image-proxy.js";

// Start server when run directly
import { createServer, startServer } from "./server.js";

const isMain = process.argv[1]?.endsWith("index.ts") ||
               process.argv[1]?.endsWith("index.js");

if (isMain) {
  const rawPort = process.env.PORT || "3001";
  let port = parseInt(rawPort, 10);
  if (Number.isNaN(port) || port < 1 || port > 65535) {
    console.warn(`[Server] Invalid PORT "${rawPort}", falling back to 3001`);
    port = 3001;
  }
  const server = createServer();
  startServer(server, port);
}
