import { showToast } from "../stores/toast";

type LLMProvider = "deepseek" | "openrouter" | "openai" | "moonshot";

const PROVIDER_TOP_UP: Record<LLMProvider, { label: string; url: string }> = {
  deepseek:   { label: "去充值", url: "https://platform.deepseek.com/top_up" },
  openai:     { label: "去充值", url: "https://platform.openai.com/account/billing" },
  openrouter: { label: "去充值", url: "https://openrouter.ai/credits" },
  moonshot:   { label: "去充值", url: "https://console.moonshot.cn/billing" },
};

/** 判断错误是否属于"余额/配额不足" */
function isBalanceError(msg: string): boolean {
  return (
    msg.includes("402") ||
    /insufficient.?(balance|credits?|quota)/i.test(msg) ||
    /exceeded.?(quota|limit|balance)/i.test(msg) ||
    /out.?of.?(credits?|balance)/i.test(msg) ||
    /payment.?required/i.test(msg) ||
    /billing/i.test(msg)
  );
}

/**
 * 解析 API 错误字符串，映射为友好的中文提示并触发 toast。
 * @param message  错误信息原文
 * @param provider 当前使用的 LLM provider（用于显示对应充值链接）
 */
export function handleApiError(message: string, provider?: LLMProvider): void {
  if (isBalanceError(message)) {
    const topUp = provider ? PROVIDER_TOP_UP[provider] : null;
    showToast(
      "API 余额不足，请充值后继续使用。",
      "destructive",
      topUp ? { label: topUp.label, onClick: () => window.open(topUp.url, "_blank") } : undefined
    );
    return;
  }
  if (message.includes("401") || /unauthorized|invalid.*key|api.?key/i.test(message)) {
    showToast("API Key 无效，请在设置中检查后重试。", "destructive");
    return;
  }
  if (message.includes("429") || /rate.?limit|too many request/i.test(message)) {
    showToast("请求频率超限，请稍后再试。", "destructive");
    return;
  }
  if (/5[0-9]{2}/.test(message) || /server error|service unavailable|bad gateway/i.test(message)) {
    showToast("服务暂时不可用，请稍后重试。", "destructive");
    return;
  }
  if (/network|fetch|connect|timeout/i.test(message)) {
    showToast("网络连接失败，请检查网络后重试。", "destructive");
    return;
  }
  // 通用兜底
  const display = message.length > 80 ? message.slice(0, 80) + "…" : message;
  showToast(`请求失败：${display}`, "destructive");
}
