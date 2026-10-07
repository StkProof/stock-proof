import type { Quote } from "@/lib/evaluate";
import {
  isUnavailableReason,
  type Q1CutReason,
  type Q1Result,
  type Q1UnavailableReason,
} from "@/lib/questions/q1-reasons";

/** Lo que la pregunta 1 le deja a `evaluate`: seguir, cortar o «no se pudo verificar». */
export type Q1GateResult<Pass> =
  | Pass
  | { kind: "cut"; reason: Q1CutReason }
  | { kind: "unavailable"; reason: Q1UnavailableReason };

/**
 * Pregunta 1 sobre el contrato pegado, antes de mirar cotizaciones. Un chequeo que no
 * llegó es «no se pudo verificar» (fail closed), no un impostor.
 */
export function checkTarget(check: Q1Result | "unavailable"): Q1GateResult<{ kind: "pass" }> {
  if (check === "unavailable") {
    return { kind: "unavailable", reason: "LIST_UNAVAILABLE" };
  }
  if (check.ok) {
    return { kind: "pass" };
  }
  return isUnavailableReason(check.reason)
    ? { kind: "unavailable", reason: check.reason }
    : { kind: "cut", reason: check.reason };
}

/**
 * Pregunta 1 sobre las cotizaciones: solo las auténticas son elegibles. Si ninguna lo es,
 * una sin verificar gana sobre los impostores («no se pudo evaluar», no se firma); si
 * todas cortan, el motivo es el del que hubiera ganado por impacto.
 */
export function decideQuestion1(quotes: Quote[]): Q1GateResult<{ kind: "pass"; eligible: Quote[] }> {
  const eligible = quotes.filter((quote) => quote.authenticity.ok);
  if (eligible.length > 0) {
    return { kind: "pass", eligible };
  }

  const unverified = quotes.find(
    (quote) => !quote.authenticity.ok && isUnavailableReason(quote.authenticity.reason),
  );
  if (unverified && !unverified.authenticity.ok && isUnavailableReason(unverified.authenticity.reason)) {
    return { kind: "unavailable", reason: unverified.authenticity.reason };
  }

  const cheapest = [...quotes].sort((a, b) => a.impactRatio - b.impactRatio)[0];
  const reason: Q1CutReason =
    cheapest !== undefined &&
    !cheapest.authenticity.ok &&
    !isUnavailableReason(cheapest.authenticity.reason)
      ? cheapest.authenticity.reason
      : "CONTRACT_NOT_LISTED";
  return { kind: "cut", reason };
}
