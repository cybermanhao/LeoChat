import { create } from "zustand";

export type ToastVariant = "default" | "destructive";

interface ToastItem {
  id: string;
  message: string;
  variant: ToastVariant;
  action?: { label: string; onClick: () => void };
}

interface ToastStore {
  toasts: ToastItem[];
  show: (message: string, variant?: ToastVariant, action?: ToastItem["action"]) => void;
  dismiss: (id: string) => void;
}

export const useToastStore = create<ToastStore>((set) => ({
  toasts: [],
  show: (message, variant = "default", action) => {
    const id = Date.now().toString();
    set((s) => ({ toasts: [...s.toasts, { id, message, variant, action }] }));
    setTimeout(() => {
      set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
    }, 5000);
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));

/** 可在非 React 环境（如 store、service）中调用 */
export const showToast = (
  message: string,
  variant: ToastVariant = "default",
  action?: ToastItem["action"]
) => useToastStore.getState().show(message, variant, action);
