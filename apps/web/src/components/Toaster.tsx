import { useToastStore } from "../stores/toast";
import {
  ToastProvider,
  ToastViewport,
  Toast,
  ToastDescription,
  ToastClose,
  ToastAction,
} from "@ai-chatbox/ui";

export function Toaster() {
  const toasts = useToastStore((s) => s.toasts);
  const dismiss = useToastStore((s) => s.dismiss);

  return (
    <ToastProvider>
      {toasts.map((toast) => (
        <Toast
          key={toast.id}
          variant={toast.variant}
          open
          onOpenChange={(open) => {
            if (!open) dismiss(toast.id);
          }}
        >
          <ToastDescription>{toast.message}</ToastDescription>
          {toast.action && (
            <ToastAction
              altText={toast.action.label}
              onClick={toast.action.onClick}
            >
              {toast.action.label}
            </ToastAction>
          )}
          <ToastClose />
        </Toast>
      ))}
      <ToastViewport className={toasts.length === 0 ? "pointer-events-none" : ""} />
    </ToastProvider>
  );
}
