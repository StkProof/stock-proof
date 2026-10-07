import type { Quote } from "@/lib/evaluate";

/**
 * Códigos de corte de la pregunta 2. `IMPACT_OVER_LIMIT` es la compra; `EXIT_OVER_LIMIT`
 * es la venta del mismo monto medida por encima del tope (Exit Now es compuerta).
 */
export const Q2_CUT_REASONS = ["IMPACT_OVER_LIMIT", "EXIT_OVER_LIMIT"] as const;

/** No se pudo medir: no se firma (fail closed), pero no es un corte. */
export const Q2_UNAVAILABLE_REASONS = ["QUOTES_UNAVAILABLE", "EXIT_NOW_UNAVAILABLE"] as const;

export type Q2CutReason = (typeof Q2_CUT_REASONS)[number];
export type Q2UnavailableReason = (typeof Q2_UNAVAILABLE_REASONS)[number];

/** `pass` lleva el ganador entre los firmables y si empató con otro. */
export type Q2Result =
  | { kind: "pass"; winner: Quote; tied: boolean }
  | { kind: "cut"; reason: Q2CutReason }
  | { kind: "unavailable"; reason: Q2UnavailableReason };
