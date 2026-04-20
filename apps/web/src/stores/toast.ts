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
  show: (message: string, variant?: ToastVariant, action?: ToastItem["action"]) => string;
  dismiss: (id: string) => void;
}

export const useToastStore = create<ToastStore>((set, get) => ({
  toasts: [],
  show: (message, variant = "default", action) => {
    const id = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    set((s) => ({ toasts: [...s.toasts, { id, message, variant, action }] }));
    const timer = setTimeout(() => {
      // Only remove if the toast still exists (wasn't manually dismissed)
      if (get().toasts.find((t) => t.id === id)) {
        set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
      }
    }, 5000);
    // Store timer reference on the toast item for cleanup
    const toast = get().toasts.find((t) => t.id === id);
    if (toast) {
      (toast as ToastItem & { _timer?: NodeJS.Timeout })._timer = timer;
    }
    return id;
  },
  dismiss: (id) => {
    const toast = get().toasts.find((t) => t.id === id);
    if (toast) {
      const timer = (toast as ToastItem & { _timer?: NodeJS.Timeout })._timer;
      if (timer) clearTimeout(timer);
    }
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
  },
}));

/** 可在非 React 环境（如 store、service）中调用 */
export const showToast = (
  message: string,
  variant: ToastVariant = "default",
  action?: ToastItem["action"]
) => useToastStore.getState().show(message, variant, action);
