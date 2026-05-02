# Image Generation UX Evaluation Report

## Test Summary

| Test Suite | Passed | Failed | Notes |
|------------|--------|--------|-------|
| `image-generation.spec.ts` (functional) | 4/4 | 0 | All core flows work |
| `image-generation-ux.spec.ts` (screenshots) | 5/5 | 0 | All states captured |

---

## Screenshots Captured

1. **01-initial-chat-page** — Clean empty chat state
2. **02-tool-call-loading** — `generate_image` in progress with spinner + progress bar
3. **03-generated-image-card** — LeoCard rendered with title, subtitle, download button
4. **04-error-state** — Shows `[完成]` (success) even though tool returned an error
5. **05-refined-image-card** — Both `generate_image` and `refine_image` calls visible in conversation

---

## UX Issues Found

### 🔴 Critical: Error State Misclassified as Success

**Screenshot 04** shows `generate_image [完成]` (green checkmark) even when the tool returned an error message ("内容安全策略限制").

**Root cause:**
- MCP server returns `{ content: [...], isError: true }` for errors
- Backend SSE `tool_result` event only forwards `id` + `result` text, losing the `isError` flag
- Frontend `api.ts` `onToolResult` handler receives `result` string without error context
- `chat-generation.ts` `toolresult` event sets `finalStatus = event.error ? "error" : "success"`, but `event.error` is never populated for MCP tool errors

**Impact:** Users cannot tell at a glance that image generation failed. They must click "详情" to see the error text hidden inside the tool-call block.

**Recommended fix:**
- Backend: include `isError` in `tool_result` SSE payload
- Frontend: check if result text contains known error patterns, or propagate `isError` from backend

---

### 🟡 Major: No "Refine This Image" Action on Cards

The generated image card only has a **"下载图片"** (Download) button. There is no way for the user to directly refine/optimize the image from the card.

The card `metadata` contains `canRefine: true`, `imageId`, and `thoughtSignature`, but these are invisible to the user and not exposed as UI actions.

**Recommended fix:**
- Add a **"优化此图"** (Refine) secondary action button to the card when `canRefine: true`
- Clicking it could pre-fill the chat input with a refine prompt template, or directly trigger `refine_image`

---

### 🟡 Major: No Cancel Button During Generation

During the ~5-30s image generation, the only visual feedback is:
- Spinner + "调用中" text
- Indeterminate progress bar

There is **no visible cancel/stop button** on the tool-call block. Users who want to abort must find the global "停止生成" button (if it exists and is visible).

**Recommended fix:**
- Add a cancel button (🛑 or ✕) inside the `ToolCallBlock` when `status === "running"`
- Clicking it should abort the in-flight request via the AbortController chain we already wired up

---

### 🟡 Moderate: Error Message Not Visible Without Expanding Details

When a tool fails, the error text is hidden behind the "详情" expand toggle. A user sees:
- `generate_image [失败]` (red X)
- No explanation in the main message body

They must click "详情" → scroll to "错误:" section to see what went wrong.

**Recommended fix:**
- Surface the error message inline below the tool-call header, or
- Show a brief error summary (1 line) directly in the assistant message content

---

### 🟢 Minor: Image Card Size

The card is relatively narrow (~300-400px). For 2K/4K images, this means the user sees a small thumbnail and must click download to view the full resolution.

**Recommendation:**
- Make the image clickable to open a lightbox/preview modal
- Or expand to full width on hover

---

### 🟢 Minor: No Generation Progress Indication

The indeterminate progress bar is nice, but it gives no sense of "how much longer?" For a 120s timeout, users might think the app is frozen.

**Recommendation:**
- Add elapsed time counter (e.g. "已用时 12s")
- Or show a text hint like "正在生成图片，大约需要 10-30 秒..."

---

## Positive UX Observations

| Aspect | Observation |
|--------|-------------|
| Tool call visibility | Clear `generate_image [调用中]` indicator with animated spinner |
| Card layout | Clean title/subtitle/button structure; follows theme system |
| Multi-turn clarity | Refine flow clearly shows both `generate_image` → `refine_image` steps |
| Download action | One-click download button is prominent and accessible |
| State recovery | Tool call states survive page reload (persisted in contentItems) |

---

## Recommendations Priority

| Priority | Item | Effort |
|----------|------|--------|
| P0 | Fix error state misclassification (backend SSE + frontend) | Small |
| P1 | Add cancel button to running ToolCallBlock | Small |
| P1 | Add "Refine this image" action to LeoCard | Medium |
| P2 | Surface error message without requiring expand | Small |
| P2 | Add elapsed time / ETA text during generation | Small |
| P3 | Image lightbox / click-to-expand | Medium |
