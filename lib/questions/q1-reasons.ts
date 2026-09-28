/**
 * Códigos de motivo de la pregunta 1 (ADR 0002). La lógica devuelve el código; el texto en
 * castellano lo escribe la pantalla.
 */
export const Q1_CUT_REASONS = [
  "TICKER_NOT_FOUND",
  "CONTRACT_NOT_LISTED",
  "ATTESTATION_MISSING",
  "STANDARD_NOT_BEP8056",
] as const;

/** No se pudo verificar: se bloquea igual (fail closed), pero no es un impostor. */
export const Q1_UNAVAILABLE_REASONS = [
  "LIST_UNAVAILABLE",
  "ATTESTATION_UNAVAILABLE",
  "CHAIN_UNAVAILABLE",
] as const;

export type Q1CutReason = (typeof Q1_CUT_REASONS)[number];
export type Q1UnavailableReason = (typeof Q1_UNAVAILABLE_REASONS)[number];
export type Q1Reason = Q1CutReason | Q1UnavailableReason;

export type Q1Result = { ok: true } | { ok: false; reason: Q1Reason };

export function isUnavailableReason(reason: Q1Reason): reason is Q1UnavailableReason {
  return (Q1_UNAVAILABLE_REASONS as readonly string[]).includes(reason);
}
