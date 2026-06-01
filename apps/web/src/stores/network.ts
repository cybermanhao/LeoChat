import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface NetworkState {
  useChinaMirrors: boolean;
  pypiMirror: string;
  hfMirror: string;
  setUseChinaMirrors: (v: boolean) => void;
  setPypiMirror: (v: string) => void;
  setHfMirror: (v: string) => void;
}

export const CHINA_MIRRORS = {
  pypi: "https://pypi.tuna.tsinghua.edu.cn/simple",
  hf: "https://hf-mirror.com",
};

export const useNetworkStore = create<NetworkState>()(
  persist(
    (set) => ({
      useChinaMirrors: true,
      pypiMirror: CHINA_MIRRORS.pypi,
      hfMirror: CHINA_MIRRORS.hf,
      setUseChinaMirrors: (v) => set({ useChinaMirrors: v }),
      setPypiMirror: (v) => set({ pypiMirror: v }),
      setHfMirror: (v) => set({ hfMirror: v }),
    }),
    {
      name: "leochat-network",
      partialize: (s) => ({
        useChinaMirrors: s.useChinaMirrors,
        pypiMirror: s.pypiMirror,
        hfMirror: s.hfMirror,
      }),
    }
  )
);
