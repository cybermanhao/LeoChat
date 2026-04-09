// ============ LeoChat Card Types ============
// Canonical card schema for structured message content.
// See docs/leochat-card-spec.md Section 5.1.

// ---------- Tone & Kind ----------

export type LeoCardTone =
  | "default"
  | "info"
  | "success"
  | "warning"
  | "error";

/**
 * Card kind. Known kinds may receive kind-specific visuals.
 * Unknown kinds fall back to generic summary-style rendering.
 * The `(string & {})` arm keeps the union open for external tool extensibility.
 */
export type LeoCardKind =
  | "summary"
  | "media"
  | "list"
  | "status"
  | "review"
  | "error"
  | (string & {});

// ---------- Body Blocks ----------

export interface LeoCardTextBlock {
  type: "text";
  text: string;
  format?: "plain" | "markdown";
}

export interface LeoCardFieldsBlock {
  type: "fields";
  fields: Array<{ label: string; value: string }>;
}

export interface LeoCardImageBlock {
  type: "image";
  image: {
    url: string;
    alt?: string;
  };
}

export interface LeoCardImagesBlock {
  type: "images";
  images: Array<{
    url: string;
    alt?: string;
  }>;
}

export interface LeoCardProgressBlock {
  type: "progress";
  progress: {
    value: number;
    max?: number;
    label?: string;
  };
}

export interface LeoCardBadgeBlock {
  type: "badge";
  badge: {
    text: string;
    tone?: LeoCardTone;
  };
}

export interface LeoCardDividerBlock {
  type: "divider";
}

export type LeoCardBlock =
  | LeoCardTextBlock
  | LeoCardFieldsBlock
  | LeoCardImageBlock
  | LeoCardImagesBlock
  | LeoCardProgressBlock
  | LeoCardBadgeBlock
  | LeoCardDividerBlock;

// ---------- Actions ----------

export interface LeoCardConfirm {
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
}

export interface LeoCardUICommandAction {
  type: "ui-command";
  command: string;
  payload?: Record<string, unknown>;
}

export interface LeoCardAgentEventAction {
  type: "agent-event";
  name: string;
  payload?: Record<string, unknown>;
}

export interface LeoCardLinkAction {
  type: "link";
  url: string;
}

export type LeoCardActionTarget =
  | LeoCardUICommandAction
  | LeoCardAgentEventAction
  | LeoCardLinkAction;

export interface LeoCardAction {
  id: string;
  label: string;
  kind?: "primary" | "secondary" | "danger";
  action: LeoCardActionTarget;
  confirm?: LeoCardConfirm;
}

// ---------- Main Card ----------

export interface LeoCard {
  id: string;
  kind: LeoCardKind;
  title?: string;
  subtitle?: string;
  tone?: LeoCardTone;
  body?: LeoCardBlock[];
  actions?: LeoCardAction[];
  metadata?: Record<string, unknown>;
}
