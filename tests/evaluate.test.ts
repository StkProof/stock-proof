import { describe, expect, it } from "vitest";
import { evaluate, IMPACT_LIMIT, type Quote } from "@/lib/evaluate";
import { evaluationExamples } from "@/lib/evaluation-examples";

const official = { listed: true, attested: true, standardOk: true };

function quotes(bstocks: number, ondo: number, xstocks: number): Quote[] {
  return [
    { wrapper: "xstocks", impactRatio: xstocks, simulatedCostUsd: 100 },
    { wrapper: "ondo", impactRatio: ondo, simulatedCostUsd: 110 },
    { wrapper: "bstocks", impactRatio: bstocks, simulatedCostUsd: 90 },
  ];
}

describe("evaluate", () => {
  it("pide corregir la entrada y no mira las cotizaciones", () => {
    expect(
      evaluate({
        ticker: "  ",
        amountUsd: 200,
        authenticity: official,
        quotes: quotes(0.001, 0.001, 0.001),
      }),
    ).toEqual({ kind: "invalid" });

    expect(
      evaluate({
        ticker: "NVDA",
        amountUsd: 0,
        authenticity: official,
        quotes: quotes(0.001, 0.001, 0.001),
      }).kind,
    ).toBe("invalid");

    expect(
      evaluate({
        ticker: "NVDA",
        amountUsd: Number.NaN,
        authenticity: "unavailable",
        quotes: "unavailable",
      }).kind,
    ).toBe("invalid");
  });

  it("corta en la pregunta 1 si el contrato no es el oficial, aunque la orden entraría", () => {
    const result = evaluate({
      ticker: "NVDA",
      amountUsd: 200,
      authenticity: { listed: true, attested: false, standardOk: true },
      quotes: quotes(0.001, 0.001, 0.001),
    });

    expect(result).toEqual({ kind: "cut", question: 1 });
  });

  it("trata un ticker ausente de la lista como pregunta 1 fallida", () => {
    expect(
      evaluate({
        ticker: "NOEXISTE",
        amountUsd: 50,
        authenticity: { listed: false, attested: true, standardOk: true },
        quotes: "unavailable",
      }),
    ).toEqual({ kind: "cut", question: 1 });
  });

  it("corta en la pregunta 1 si falta el estándar, aunque esté listado y attestado", () => {
    expect(
      evaluate({
        ticker: "NVDA",
        amountUsd: 50,
        authenticity: { listed: true, attested: true, standardOk: false },
        quotes: quotes(0.001, 0.5, 0.5),
      }),
    ).toEqual({ kind: "cut", question: 1 });
  });

  it("elige el wrapper de menor impacto cuando está en el umbral o por debajo", () => {
    const result = evaluate({
      ticker: "NVDA",
      amountUsd: 200,
      authenticity: official,
      quotes: quotes(0.004, 0.008, IMPACT_LIMIT),
    });

    expect(result).toMatchObject({
      kind: "pass",
      wrapper: "bstocks",
      impactRatio: 0.004,
      simulatedCostUsd: 90,
      tied: false,
    });
  });

  it("acepta un impacto exactamente del 1%", () => {
    const result = evaluate({
      ticker: "SPY",
      amountUsd: 200,
      authenticity: official,
      quotes: quotes(0.02, IMPACT_LIMIT, 0.05),
    });

    expect(result).toMatchObject({
      kind: "pass",
      wrapper: "ondo",
      impactRatio: IMPACT_LIMIT,
      tied: false,
    });
  });

  it("corta en la pregunta 2 y devuelve los tres costos cuando todos superan el 1%", () => {
    const result = evaluate({
      ticker: "NVDA",
      amountUsd: 10_000,
      authenticity: official,
      quotes: quotes(0.018, 0.063, 0.02),
    });

    expect(result).toEqual({
      kind: "cut",
      question: 2,
      quotes: [
        { wrapper: "bstocks", impactRatio: 0.018, simulatedCostUsd: 90 },
        { wrapper: "ondo", impactRatio: 0.063, simulatedCostUsd: 110 },
        { wrapper: "xstocks", impactRatio: 0.02, simulatedCostUsd: 100 },
      ],
    });
  });

  it("desempata bStocks, Ondo, xStocks y marca el empate", () => {
    const bstocksAndOndo = evaluate({
      ticker: "NVDA",
      amountUsd: 200,
      authenticity: official,
      quotes: quotes(0.005, 0.005, 0.009),
    });
    expect(bstocksAndOndo).toMatchObject({
      kind: "pass",
      wrapper: "bstocks",
      tied: true,
    });

    const ondoAndXstocks = evaluate({
      ticker: "NVDA",
      amountUsd: 200,
      authenticity: official,
      quotes: quotes(0.02, 0.004, 0.004),
    });
    expect(ondoAndXstocks).toMatchObject({
      kind: "pass",
      wrapper: "ondo",
      tied: true,
    });
  });

  it("no inventa un precio si la lista o las cotizaciones no sirven", () => {
    expect(
      evaluate({
        ticker: "NVDA",
        amountUsd: 200,
        authenticity: "unavailable",
        quotes: quotes(0.001, 0.001, 0.001),
      }),
    ).toEqual({ kind: "unavailable" });

    expect(
      evaluate({
        ticker: "NVDA",
        amountUsd: 200,
        authenticity: official,
        quotes: "unavailable",
      }).kind,
    ).toBe("unavailable");

    expect(
      evaluate({
        ticker: "NVDA",
        amountUsd: 200,
        authenticity: official,
        quotes: quotes(0.001, 0.001, 0.001).slice(0, 2),
      }).kind,
    ).toBe("unavailable");

    const broken = quotes(0.001, 0.001, 0.001);
    broken[0] = { ...broken[0], impactRatio: Number.NaN };
    expect(
      evaluate({
        ticker: "NVDA",
        amountUsd: 200,
        authenticity: official,
        quotes: broken,
      }).kind,
    ).toBe("unavailable");
  });

  it("los ejemplos de la pantalla son los cinco estados de evaluate", () => {
    expect(evaluationExamples.invalid.kind).toBe("invalid");
    expect(evaluationExamples.unavailable.kind).toBe("unavailable");
    expect(evaluationExamples.cutQuestion1).toEqual({ kind: "cut", question: 1 });
    expect(evaluationExamples.cutQuestion2.kind).toBe("cut");
    if (evaluationExamples.cutQuestion2.kind === "cut") {
      expect(evaluationExamples.cutQuestion2.question).toBe(2);
    }
    expect(evaluationExamples.pass).toMatchObject({
      kind: "pass",
      wrapper: "bstocks",
      tied: false,
    });
  });
});
