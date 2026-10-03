import type { ConstraintCode, QuestionId, WrapperId } from "@/lib/evaluate";

/**
 * Textos de la pantalla (la lógica devuelve códigos; el castellano lo escribe acá).
 * Provisionales: Luciano los afina en la issue #21.
 */

/** Lectura en pantalla de cualquier `"unavailable"`: «sin dato». */
export const SIN_DATO = "sin dato";

export const QUESTION_TEXT: Record<QuestionId, string> = {
  1: "¿Este contrato es el real?",
  2: "¿Esta orden entra?",
  3: "¿Este número es la acción?",
  4: "¿En qué régimen está este ticker?",
};

const REASON_TEXT: Record<string, string> = {
  // Pregunta 1, cortes (ADR 0002)
  TICKER_NOT_FOUND: "El ticker no figura en la lista oficial.",
  CONTRACT_NOT_LISTED: "Este contrato no es el token oficial de ese ticker.",
  ATTESTATION_MISSING: "El token no tiene la attestation que lo respalda.",
  STANDARD_NOT_BEP8056: "El token no cumple el estándar BEP-8056.",
  // Pregunta 1, no se pudo verificar
  LIST_UNAVAILABLE: "La lista oficial no respondió.",
  ATTESTATION_UNAVAILABLE: "La attestation no se pudo consultar.",
  CHAIN_UNAVAILABLE: "La cadena no respondió.",
  // Pregunta 2
  IMPACT_OVER_LIMIT: "Ningún emisor llena este monto con un impacto del 1% o menos.",
  QUOTES_UNAVAILABLE: "No se pudieron obtener las simulaciones de costo.",
  EXIT_OVER_LIMIT: "Vender este monto ahora cuesta más del 1%: ese emisor no tiene salida bajo el tope.",
  EXIT_NOW_UNAVAILABLE: "La venta de este monto no se pudo medir: no hay salida medible.",
  // Pregunta 3
  DEVIATION_UNEXPLAINED: "El precio del token no es el de la acción y no lo explica ni el multiplicador ni el retorno total.",
  TOKEN_PRICE_UNAVAILABLE: "No se pudo obtener el precio del token en la ruta.",
  REFERENCE_PRICE_UNAVAILABLE: "No se pudo obtener el precio de referencia de la acción.",
  // Pregunta 4
  POOLS_DISAGREE: "Los pools de este ticker no coinciden entre sí.",
};

/**
 * Un código de motivo a frase corta. Un código que la pantalla no conozca se muestra
 * con un texto genérico, nunca crudo (spec de formato).
 */
export function reasonText(code: string): string {
  return REASON_TEXT[code] ?? "Motivo no reconocido.";
}

export const WRAPPER_LABEL: Record<WrapperId, string> = {
  bstocks: "bStocks",
  ondo: "Ondo",
  xstocks: "xStocks",
};

export function marketStatusText(status: "open" | "closed" | "unavailable"): string {
  if (status === "open") return "abierto";
  if (status === "closed") return "cerrado";
  return SIN_DATO;
}

export function multiplierNoteText(
  note: "none" | "multiplier" | "total-return" | "unavailable",
): string {
  if (note === "none") return "sin multiplicador de dividendos";
  if (note === "multiplier") return "con multiplicador de dividendos";
  if (note === "total-return") return "token de retorno total";
  return SIN_DATO;
}

export function booleanText(value: boolean | "unavailable"): string {
  if (value === "unavailable") return SIN_DATO;
  return value ? "sí" : "no";
}

const CONSTRAINT_TEXT: Record<ConstraintCode, string> = {
  MAX_IMPACT_RATIO: "el tope de impacto",
  MAX_DEVIATION_RATIO: "el tope de desvío contra la referencia",
};

export function constraintText(code: ConstraintCode): string {
  return CONSTRAINT_TEXT[code] ?? "un tope de la frase";
}

const QUOTE_GAP_TEXT: Record<string, string> = {
  NOT_LISTED: "no figura en la lista oficial",
  NO_QUOTE: "no devolvió cotización",
};

/** Hueco de cotización a frase. Un motivo desconocido no se muestra crudo. */
export function quoteGapText(reason: string): string {
  return QUOTE_GAP_TEXT[reason] ?? "sin cotización, por un motivo no reconocido";
}
