import { WRAPPERS, type Quote, type WrapperExit, type WrapperId } from "@/lib/evaluate";
import type { Q2Result } from "@/lib/questions/q2-reasons";
import { IMPACT_LIMIT } from "@/lib/thresholds";

/**
 * Pregunta 2: «¿esta orden entra?», compuerta doble. Un wrapper se puede firmar solo si
 * la compra (`impactRatio`) **y** la venta del mismo monto (Exit Now, `now.costRatio`)
 * están en `IMPACT_LIMIT` o menos. Si la venta no se midió, ese wrapper no se firma
 * (fail closed).
 *
 * Recibe las cotizaciones que ya pasaron la pregunta 1. Gana el de menor impacto de
 * compra entre los firmables; el empate se rompe por el orden de `WRAPPERS`.
 */
export function decideQuestion2(
  eligible: Quote[],
  exitByWrapper: ReadonlyMap<WrapperId, WrapperExit>,
): Q2Result {
  const fitting = eligible.filter((quote) => quote.impactRatio <= IMPACT_LIMIT);
  if (fitting.length === 0) {
    return { kind: "cut", reason: "IMPACT_OVER_LIMIT" };
  }

  const signable = fitting.filter((quote) => {
    const now = exitByWrapper.get(quote.wrapper)?.now;
    return now !== "unavailable" && now !== undefined && now.costRatio <= IMPACT_LIMIT;
  });

  if (signable.length === 0) {
    const measuredOverLimit = fitting.some((quote) => {
      const now = exitByWrapper.get(quote.wrapper)?.now;
      return now !== "unavailable" && now !== undefined && now.costRatio > IMPACT_LIMIT;
    });
    return measuredOverLimit
      ? { kind: "cut", reason: "EXIT_OVER_LIMIT" }
      : { kind: "unavailable", reason: "EXIT_NOW_UNAVAILABLE" };
  }

  const bestImpact = Math.min(...signable.map((quote) => quote.impactRatio));
  const atBest = signable.filter((quote) => quote.impactRatio === bestImpact);
  const winner = WRAPPERS.map((wrapper) =>
    atBest.find((quote) => quote.wrapper === wrapper),
  ).find((quote): quote is Quote => quote !== undefined);

  if (winner === undefined) {
    return { kind: "unavailable", reason: "QUOTES_UNAVAILABLE" };
  }
  return { kind: "pass", winner, tied: atBest.length > 1 };
}
