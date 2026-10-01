import type { Regime } from "@/lib/evaluate";

/**
 * Códigos de motivo de la pregunta 4 (mismo patrón que el ADR 0002). La lógica devuelve
 * el código; el texto en castellano lo escribe la pantalla.
 */
export const Q4_CUT_REASONS = ["POOLS_DISAGREE"] as const;

export type Q4CutReason = (typeof Q4_CUT_REASONS)[number];

/**
 * `pass` lleva el régimen medido para que el comprobante lo diga (libro clavado, mercado
 * cerrado, pools). El corte lo lleva igual: la pantalla muestra el régimen y el motivo.
 */
export type Q4Result =
  | { ok: true; regime: Regime }
  | { ok: false; reason: Q4CutReason; regime: Regime };
