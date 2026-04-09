// ============ LeoChat Card Content Utilities ============
// Type guards and normalizer for structured card payloads.
// See docs/leochat-card-spec.md Section 6.1.

import type { LeoCard } from "../types/card";

/**
 * Type guard: checks whether `value` is a valid LeoCard.
 *
 * Minimum valid card has `id` (string) and `kind` (string).
 * Extra/unknown fields are tolerated (permissive for MCP payloads).
 */
export function isLeoCard(value: unknown): value is LeoCard {
  if (value === null || typeof value !== "object") return false;

  const obj = value as Record<string, unknown>;

  if (typeof obj.id !== "string" || obj.id === "") return false;
  if (typeof obj.kind !== "string" || obj.kind === "") return false;

  // Optional fields: validate types only when present
  if (obj.title !== undefined && typeof obj.title !== "string") return false;
  if (obj.subtitle !== undefined && typeof obj.subtitle !== "string") return false;
  if (obj.tone !== undefined && typeof obj.tone !== "string") return false;
  if (obj.body !== undefined && !Array.isArray(obj.body)) return false;
  if (obj.actions !== undefined && !Array.isArray(obj.actions)) return false;
  if (obj.metadata !== undefined && (typeof obj.metadata !== "object" || obj.metadata === null)) return false;

  return true;
}

/**
 * Detects the structured card payload envelope used in tool results.
 *
 * Expected shape:
 * ```json
 * { "type": "leochat-card", "card": { ... } }
 * ```
 */
export function isLeoCardContentPayload(
  value: unknown,
): value is { type: "leochat-card"; card: LeoCard } {
  if (value === null || typeof value !== "object") return false;

  const obj = value as Record<string, unknown>;

  if (obj.type !== "leochat-card") return false;
  if (!isLeoCard(obj.card)) return false;

  return true;
}

/**
 * Permissive normalizer: attempts to extract a LeoCard from various input shapes.
 *
 * Supported inputs:
 * - A valid LeoCard object
 * - A `{ type: "leochat-card", card: LeoCard }` envelope
 * - A JSON string encoding either of the above
 *
 * Returns `null` on invalid / unrecognizable payloads.
 * Does NOT mutate the input.
 */
export function normalizeLeoCard(value: unknown): LeoCard | null {
  // Handle JSON strings
  if (typeof value === "string") {
    let parsed: unknown;
    try {
      parsed = JSON.parse(value);
    } catch {
      return null;
    }
    return normalizeLeoCard(parsed);
  }

  if (value === null || typeof value !== "object") return null;

  // Direct LeoCard
  if (isLeoCard(value)) return value as LeoCard;

  // Envelope format
  if (isLeoCardContentPayload(value)) return value.card;

  return null;
}
