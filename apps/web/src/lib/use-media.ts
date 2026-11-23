/** 媒体查询（窗口宽度变化时更新） */
import { useEffect, useState } from "react";

export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => typeof window !== "undefined" && window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = () => setMatches(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, [query]);
  return matches;
}

/** 手机布局（按 dsh：768px 以下）：侧边栏变抽屉，右栏全屏 */
export const useIsMobile = () => useMediaQuery("(max-width: 767px)");
