import { create } from "zustand";
import { persist } from "zustand/middleware";

interface OnboardingState {
  onboardingCompleted: boolean;
  workDir: string;
  setOnboardingCompleted: (v: boolean) => void;
  setWorkDir: (path: string) => void;
}

export const useOnboardingStore = create<OnboardingState>()(
  persist(
    (set) => ({
      onboardingCompleted: false,
      workDir: "",
      setOnboardingCompleted: (v) => set({ onboardingCompleted: v }),
      setWorkDir: (path) => set({ workDir: path }),
    }),
    {
      name: "leochat-onboarding",
      partialize: (state) => ({
        onboardingCompleted: state.onboardingCompleted,
        workDir: state.workDir,
      }),
    }
  )
);
