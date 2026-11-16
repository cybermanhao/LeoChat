/**
 * @leochat/deepseek —— DeepSeek provider（Messages 端点，带服务端工具和引用）与独立工具。
 * 设计文档：docs/superpowers/specs/2026-11-14-leochat-core-design.md §10、§13
 */
export {
  deepseek,
  deepseekCapabilities,
  buildBody,
  toWireMessages,
  mapMessagesStream,
  toUsage,
  errorFromStatus,
  type DeepSeekOptions,
} from "./provider";
export { deepseekSearch, deepseekFetch, deepseekOcr, type DeepSeekToolOptions, type OcrFileResolver } from "./tools";
export { priceUsage, isPeak, OFF_PEAK_RATES, TOOL_FEES } from "./pricing";
export { deepseekFiles, type FilePurpose, type UploadedFile, type DeepSeekFilesOptions } from "./files";
export { FILES_BETA, referencesUploadedFiles } from "./provider";
export { parseSse, type SseRecord } from "./sse";
