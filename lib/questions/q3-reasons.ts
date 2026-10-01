/**
 * Códigos de la pregunta 3 («¿este número es la acción?», Idea.md 30 sep 2026).
 * La lógica devuelve el código; el texto en castellano lo escribe la pantalla.
 */

/** Explicación de un pase: por qué el número de la wallet sí es la acción. */
export const Q3_PASS_CODES = [
  /** El precio del token es el precio de referencia del subyacente. */
  "PRICE_MATCHES",
  /** El desvío es el multiplicador de acciones (dividendo reinvertido o split). */
  "DEVIATION_IS_MULTIPLIER",
  /** Ondo es retorno total: su precio no tiene que coincidir con la cotización. */
  "DEVIATION_IS_TOTAL_RETURN",
] as const;

/** Motivos de corte de la pregunta 3. */
export const Q3_CUT_REASONS = [
  /** Los dos precios existen y ni el multiplier ni el retorno total explican el desvío. */
  "DEVIATION_UNEXPLAINED",
] as const;

/** No se pudo evaluar: falta un precio. Se bloquea igual (fail closed), pero no es un corte. */
export const Q3_UNAVAILABLE_REASONS = [
  "TOKEN_PRICE_UNAVAILABLE",
  "REFERENCE_PRICE_UNAVAILABLE",
] as const;

export type Q3PassCode = (typeof Q3_PASS_CODES)[number];
export type Q3CutReason = (typeof Q3_CUT_REASONS)[number];
export type Q3UnavailableReason = (typeof Q3_UNAVAILABLE_REASONS)[number];

export type Q3Result =
  | { kind: "pass"; code: Q3PassCode }
  | { kind: "cut"; reason: Q3CutReason }
  | { kind: "unavailable"; reason: Q3UnavailableReason };
