import { describe, expect, it } from "vitest";
import { decideQuestion3, type Q3Input } from "@/lib/questions/q3";
import {
  Q3_CUT_REASONS,
  Q3_PASS_CODES,
  Q3_UNAVAILABLE_REASONS,
} from "@/lib/questions/q3-reasons";

function input(overrides: Partial<Q3Input> = {}): Q3Input {
  return {
    wrapper: "bstocks",
    tokenPriceUsd: 489.12,
    referenceUsd: 489.12,
    ...overrides,
  };
}

describe("decideQuestion3", () => {
  it("pasa con PRICE_MATCHES cuando el token cotiza lo mismo que el subyacente", () => {
    expect(decideQuestion3(input())).toEqual({ kind: "pass", code: "PRICE_MATCHES" });
    expect(
      decideQuestion3(input({ wrapper: "xstocks", tokenPriceUsd: 65.41, referenceUsd: 65.41 })),
    ).toEqual({ kind: "pass", code: "PRICE_MATCHES" });
  });

  it("pasa con DEVIATION_IS_MULTIPLIER cuando el multiplier reconcilia el desvío de un bStock", () => {
    // Dividendo reinvertido: 500 × 1.02 = 510. El token vale 1.02 acciones.
    expect(
      decideQuestion3(
        input({ tokenPriceUsd: 510, referenceUsd: 500, sharesMultiplier: 1.02 }),
      ),
    ).toEqual({ kind: "pass", code: "DEVIATION_IS_MULTIPLIER" });
    // Split 2:1 por el mismo mecanismo (BEP-677).
    expect(
      decideQuestion3(
        input({ tokenPriceUsd: 978.24, referenceUsd: 489.12, sharesMultiplier: 2 }),
      ),
    ).toEqual({ kind: "pass", code: "DEVIATION_IS_MULTIPLIER" });
  });

  it("pasa con DEVIATION_IS_TOTAL_RETURN cuando un Ondo no coincide con la cotización", () => {
    // Ondo reinvierte el dividendo en el precio: 501.34 contra una referencia de 489.12.
    expect(
      decideQuestion3(
        input({ wrapper: "ondo", tokenPriceUsd: 501.34, referenceUsd: 489.12 }),
      ),
    ).toEqual({ kind: "pass", code: "DEVIATION_IS_TOTAL_RETURN" });
  });

  it("prefiere la causa exacta: un Ondo reconciliado por el multiplier no es retorno total", () => {
    expect(
      decideQuestion3(
        input({
          wrapper: "ondo",
          tokenPriceUsd: 978.24,
          referenceUsd: 489.12,
          sharesMultiplier: 2,
        }),
      ),
    ).toEqual({ kind: "pass", code: "DEVIATION_IS_MULTIPLIER" });
    // Y el que coincide con la referencia no pasa por retorno total sino por coincidencia.
    expect(decideQuestion3(input({ wrapper: "ondo" }))).toEqual({
      kind: "pass",
      code: "PRICE_MATCHES",
    });
  });

  it("corta con DEVIATION_UNEXPLAINED cuando los dos precios existen y no tienen causa", () => {
    // 495.30 contra 489.12: 1,26% arriba sin multiplier ni retorno total.
    expect(
      decideQuestion3(input({ tokenPriceUsd: 495.30, referenceUsd: 489.12 })),
    ).toEqual({ kind: "cut", reason: "DEVIATION_UNEXPLAINED" });
    expect(
      decideQuestion3(
        input({ wrapper: "xstocks", tokenPriceUsd: 64.9, referenceUsd: 65.41 }),
      ),
    ).toEqual({ kind: "cut", reason: "DEVIATION_UNEXPLAINED" });
  });

  it("corta cuando el multiplier existe pero no reconcilia el desvío", () => {
    expect(
      decideQuestion3(
        input({ tokenPriceUsd: 495.3, referenceUsd: 489.12, sharesMultiplier: 1.02 }),
      ),
    ).toEqual({ kind: "cut", reason: "DEVIATION_UNEXPLAINED" });
  });

  it("corta el desvío chico sin causa: no hay umbral de porcentaje que lo absorba", () => {
    expect(
      decideQuestion3(input({ tokenPriceUsd: 489.25, referenceUsd: 489.12 })),
    ).toEqual({ kind: "cut", reason: "DEVIATION_UNEXPLAINED" });
  });

  it("no completa datos: un desvío de 2× sin multiplier es un corte, no una reconciliación", () => {
    expect(
      decideQuestion3(input({ tokenPriceUsd: 978.24, referenceUsd: 489.12 })),
    ).toEqual({ kind: "cut", reason: "DEVIATION_UNEXPLAINED" });
    expect(
      decideQuestion3(
        input({
          tokenPriceUsd: 978.24,
          referenceUsd: 489.12,
          sharesMultiplier: "unavailable",
        }),
      ),
    ).toEqual({ kind: "cut", reason: "DEVIATION_UNEXPLAINED" });
  });

  it("devuelve TOKEN_PRICE_UNAVAILABLE si falta el precio del token", () => {
    expect(decideQuestion3(input({ tokenPriceUsd: "unavailable" }))).toEqual({
      kind: "unavailable",
      reason: "TOKEN_PRICE_UNAVAILABLE",
    });
  });

  it("devuelve REFERENCE_PRICE_UNAVAILABLE si falta la referencia, con el token presente", () => {
    expect(decideQuestion3(input({ referenceUsd: "unavailable" }))).toEqual({
      kind: "unavailable",
      reason: "REFERENCE_PRICE_UNAVAILABLE",
    });
    // La API publica `null` fuera de rueda: es «no llegó», no un cero.
    expect(decideQuestion3(input({ referenceUsd: null }))).toEqual({
      kind: "unavailable",
      reason: "REFERENCE_PRICE_UNAVAILABLE",
    });
  });

  it("trata como no disponible un precio que no es un número positivo", () => {
    expect(decideQuestion3(input({ tokenPriceUsd: 0 }))).toEqual({
      kind: "unavailable",
      reason: "TOKEN_PRICE_UNAVAILABLE",
    });
    expect(decideQuestion3(input({ referenceUsd: -12 }))).toEqual({
      kind: "unavailable",
      reason: "REFERENCE_PRICE_UNAVAILABLE",
    });
    expect(decideQuestion3(input({ tokenPriceUsd: Number.NaN }))).toEqual({
      kind: "unavailable",
      reason: "TOKEN_PRICE_UNAVAILABLE",
    });
  });

  it("un multiplier roto o ausente no explica nada ni rompe la decisión", () => {
    for (const sharesMultiplier of [0, -1, Number.NaN, "unavailable" as const]) {
      expect(
        decideQuestion3(input({ tokenPriceUsd: 495.3, sharesMultiplier })),
      ).toEqual({ kind: "cut", reason: "DEVIATION_UNEXPLAINED" });
    }
    // Multiplier 1 tampoco explica un desvío: referencia × 1 = referencia.
    expect(
      decideQuestion3(input({ tokenPriceUsd: 495.3, sharesMultiplier: 1 })),
    ).toEqual({ kind: "cut", reason: "DEVIATION_UNEXPLAINED" });
  });
});

describe("códigos de la pregunta 3", () => {
  it("son tres conjuntos disjuntos", () => {
    const all = [...Q3_PASS_CODES, ...Q3_CUT_REASONS, ...Q3_UNAVAILABLE_REASONS];
    expect(new Set(all).size).toBe(all.length);
  });
});
