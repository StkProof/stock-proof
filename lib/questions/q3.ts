import type { WrapperId } from "@/lib/evaluate";
import type { Q3Result } from "@/lib/questions/q3-reasons";

/**
 * Tolerancia de punto flotante para «es el mismo número», no un umbral de desvío.
 * Absorbe el error de una multiplicación (~1e-13 relativo); la regla del vault no fija
 * porcentaje: o el precio es el de la acción, o el desvío tiene una causa conocida.
 */
const FLOAT_TOLERANCE = 1e-9;

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
  return Math.abs(a - b) <= FLOAT_TOLERANCE * Math.max(Math.abs(a), Math.abs(b));
}
