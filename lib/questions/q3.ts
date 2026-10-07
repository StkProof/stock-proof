import type { Reference, WrapperId } from "@/lib/evaluate";
import type { Q3Result } from "@/lib/questions/q3-reasons";
import { PRICE_MATCH_TOLERANCE } from "@/lib/thresholds";

export type Q3Input = {
  wrapper: WrapperId;
  /** Precio del token en USD en la ruta on-chain. */
  tokenPriceUsd: number | "unavailable";
  /** Precio de referencia del subyacente en USD; `null` = fuera de rueda (no llegó). */
  referenceUsd: number | "unavailable" | null;
  /**
   * Acciones por token (el token cotiza referencia × multiplicador). bStocks y Ondo lo
   * publican; xStocks suele no traerlo o ser 1. Ausente o `"unavailable"` es «sin dato».
   */
  sharesMultiplier?: number | "unavailable";
};

/**
 * Pregunta 3: «¿este número es la acción?» (Idea.md, 30 sep 2026).
 * Si el desvío se explica por el multiplier o porque Ondo es retorno total, pasa y el
 * código lo dice. Si los dos precios existen y ninguna de las dos causas lo explica,
 * corta. Si falta un precio, `unavailable`. No inventa un umbral ni completa datos.
 */
export function decideQuestion3(input: Q3Input): Q3Result {
  const token = usablePrice(input.tokenPriceUsd);
  if (token === undefined) {
    return { kind: "unavailable", reason: "TOKEN_PRICE_UNAVAILABLE" };
  }
  const reference = usablePrice(input.referenceUsd);
  if (reference === undefined) {
    return { kind: "unavailable", reason: "REFERENCE_PRICE_UNAVAILABLE" };
  }

  if (samePrice(token, reference)) {
    return { kind: "pass", code: "PRICE_MATCHES" };
  }

  const multiplier = usableMultiplier(input.sharesMultiplier);
  if (multiplier !== undefined && samePrice(token, reference * multiplier)) {
    return { kind: "pass", code: "DEVIATION_IS_MULTIPLIER" };
  }

  if (input.wrapper === "ondo") {
    return { kind: "pass", code: "DEVIATION_IS_TOTAL_RETURN" };
  }

  return { kind: "cut", reason: "DEVIATION_UNEXPLAINED" };
}

/** Precio usable: finito y positivo. Cualquier otra cosa es «no llegó», no un cero. */
function usablePrice(price: number | "unavailable" | null | undefined): number | undefined {
  return typeof price === "number" && Number.isFinite(price) && price > 0
    ? price
    : undefined;
}

/** Multiplicador usable: finito y positivo. Uno roto o ausente no se completa: queda sin dato. */
function usableMultiplier(
  multiplier: number | "unavailable" | undefined,
): number | undefined {
  return typeof multiplier === "number" && Number.isFinite(multiplier) && multiplier > 0
    ? multiplier
    : undefined;
}

function samePrice(a: number, b: number): boolean {
  return Math.abs(a - b) <= PRICE_MATCH_TOLERANCE * Math.max(Math.abs(a), Math.abs(b));
}

/**
 * El `Reference` de la pantalla sale de los precios crudos del candidato. El desvío
 * se calcula igual que siempre; `multiplierNote` refleja lo que explicó la respuesta
 * de la pregunta 3 (retorno total) o el multiplicador que vino en los datos.
 */
export function buildReference(input: Q3Input | undefined, q3: Q3Result): Reference {
  const referenceUsd = usablePrice(input?.referenceUsd);
  const poolUsd = usablePrice(input?.tokenPriceUsd);
  const multiplier = usableMultiplier(input?.sharesMultiplier);
  const multiplierNote: Reference["multiplierNote"] =
    q3.kind === "pass" && q3.code === "DEVIATION_IS_TOTAL_RETURN"
      ? "total-return"
      : multiplier === undefined
        ? "unavailable"
        : multiplier === 1
          ? "none"
          : "multiplier";
  return {
    referenceUsd: referenceUsd ?? "unavailable",
    poolUsd: poolUsd ?? "unavailable",
    deviationRatio:
      referenceUsd !== undefined && poolUsd !== undefined
        ? Math.abs(poolUsd - referenceUsd) / referenceUsd
        : "unavailable",
    multiplierNote,
  };
}
