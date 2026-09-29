import { describe, expect, it } from "vitest";
import {
  evaluate,
  IMPACT_LIMIT,
  type Evaluation,
  type Quote,
  type QuoteGap,
} from "@/lib/evaluate";
import { evaluationExamples } from "@/lib/evaluation-examples";
import type { Q1Result } from "@/lib/questions/q1-reasons";

const OK: Q1Result = { ok: true };
const NOT_LISTED: Q1Result = { ok: false, reason: "CONTRACT_NOT_LISTED" };
const LIST_DOWN: Q1Result = { ok: false, reason: "LIST_UNAVAILABLE" };

const ADDR = {
  bstocks: "0x0000000000000000000000000000000000000b51",
  ondo: "0x0000000000000000000000000000000000000bd0",
  xstocks: "0x0000000000000000000000000000000000000c51",
};

function quotes(
  bstocks: number,
  ondo: number,
  xstocks: number,
  authenticity: Q1Result | Partial<Record<Quote["wrapper"], Q1Result>> = OK,
): Quote[] {
  const byWrapper = (wrapper: Quote["wrapper"]): Q1Result =>
    typeof authenticity === "object" && "ok" in authenticity
      ? authenticity
      : (authenticity[wrapper] ?? OK);
  return [
    {
      wrapper: "xstocks",
      address: ADDR.xstocks,
      side: "buy",
      impactRatio: xstocks,
      simulatedCostUsd: 100,
      authenticity: byWrapper("xstocks"),
    },
    {
      wrapper: "ondo",
      address: ADDR.ondo,
      side: "buy",
      impactRatio: ondo,
      simulatedCostUsd: 110,
      authenticity: byWrapper("ondo"),
    },
    {
      wrapper: "bstocks",
      address: ADDR.bstocks,
      side: "buy",
      impactRatio: bstocks,
      simulatedCostUsd: 90,
      authenticity: byWrapper("bstocks"),
    },
  ];
}

function passOrFail(result: Evaluation): asserts result is Extract<Evaluation, { kind: "pass" }> {
  expect(result.kind).toBe("pass");
}

describe("evaluate", () => {
  it("pide corregir la entrada y no mira las cotizaciones", () => {
    expect(
      evaluate({ ticker: "  ", amountUsd: 200, quotes: quotes(0.001, 0.001, 0.001) }),
    ).toEqual({ kind: "invalid" });

    expect(
      evaluate({ ticker: "NVDA", amountUsd: 0, quotes: quotes(0.001, 0.001, 0.001) }).kind,
    ).toBe("invalid");

    expect(
      evaluate({ ticker: "NVDA", amountUsd: Number.NaN, quotes: "unavailable" }).kind,
    ).toBe("invalid");
  });

  it("corta en la pregunta 1 con motivo y dirección cuando el contrato pegado no es el oficial", () => {
    const result = evaluate({
      ticker: "NVDA",
      amountUsd: 200,
      target: { address: "0ximpostor", check: NOT_LISTED },
      quotes: quotes(0.001, 0.001, 0.001),
    });

    expect(result).toEqual({
      kind: "cut",
      question: 1,
      reason: "CONTRACT_NOT_LISTED",
      address: "0ximpostor",
    });
  });

  it("devuelve «no se pudo evaluar» si el chequeo del contrato pegado no respondió", () => {
    expect(
      evaluate({
        ticker: "NVDA",
        amountUsd: 200,
        target: { address: "0xcualquiera", check: "unavailable" },
        quotes: quotes(0.001, 0.001, 0.001),
      }),
    ).toEqual({ kind: "unavailable", question: 1, reason: "LIST_UNAVAILABLE" });

    expect(
      evaluate({
        ticker: "NVDA",
        amountUsd: 200,
        target: {
          address: "0xcualquiera",
          check: { ok: false, reason: "ATTESTATION_UNAVAILABLE" },
        },
        quotes: quotes(0.001, 0.001, 0.001),
      }),
    ).toEqual({ kind: "unavailable", question: 1, reason: "ATTESTATION_UNAVAILABLE" });
  });

  it("un wrapper cuya pregunta 1 no pasó cotiza pero nunca gana", () => {
    // xStocks tiene el mejor impacto pero su contrato no está verificado: gana bStocks.
    const result = evaluate({
      ticker: "NVDA",
      amountUsd: 200,
      quotes: quotes(0.008, 0.009, 0.001, { xstocks: NOT_LISTED }),
    });

    passOrFail(result);
    expect(result.wrapper).toBe("bstocks");
    expect(result.impactRatio).toBe(0.008);
  });

  it("corta en la pregunta 1 con el motivo del que hubiera ganado cuando ningún contrato es real", () => {
    const result = evaluate({
      ticker: "NVDA",
      amountUsd: 200,
      quotes: quotes(0.005, 0.003, 0.001, {
        bstocks: { ok: false, reason: "STANDARD_NOT_BEP8056" },
        ondo: NOT_LISTED,
        xstocks: { ok: false, reason: "ATTESTATION_MISSING" },
      }),
    });

    expect(result).toMatchObject({
      kind: "cut",
      question: 1,
      reason: "ATTESTATION_MISSING",
    });
  });

  it("es «no se pudo evaluar» y no impostor si alguna pregunta 1 quedó sin verificar", () => {
    const result = evaluate({
      ticker: "NVDA",
      amountUsd: 200,
      quotes: quotes(0.005, 0.003, 0.001, {
        bstocks: NOT_LISTED,
        ondo: NOT_LISTED,
        xstocks: LIST_DOWN,
      }),
    });

    expect(result).toEqual({ kind: "unavailable", question: 1, reason: "LIST_UNAVAILABLE" });
  });

  it("elige el wrapper elegible de menor impacto cuando está en el umbral o por debajo", () => {
    const result = evaluate({
      ticker: "NVDA",
      amountUsd: 200,
      quotes: quotes(0.004, 0.008, IMPACT_LIMIT, { xstocks: OK }),
    });

    expect(result).toMatchObject({
      kind: "pass",
      wrapper: "bstocks",
      address: ADDR.bstocks,
      impactRatio: 0.004,
      simulatedCostUsd: 90,
      tied: false,
    });
  });

  it("acepta un impacto exactamente del 1%", () => {
    const result = evaluate({
      ticker: "SPY",
      amountUsd: 200,
      quotes: quotes(0.02, IMPACT_LIMIT, 0.05, { xstocks: LIST_DOWN }),
    });

    expect(result).toMatchObject({ kind: "pass", wrapper: "ondo", impactRatio: IMPACT_LIMIT });
  });

  it("corta en la pregunta 2 con motivo y devuelve las tres cotizaciones en orden estable", () => {
    const result = evaluate({
      ticker: "NVDA",
      amountUsd: 10_000,
      quotes: quotes(0.018, 0.063, 0.02),
    });

    expect(result).toMatchObject({
      kind: "cut",
      question: 2,
      reason: "IMPACT_OVER_LIMIT",
    });
    if (result.kind === "cut" && "quotes" in result) {
      expect(result.quotes?.map((quote) => quote.wrapper)).toEqual([
        "bstocks",
        "ondo",
        "xstocks",
      ]);
    }
  });

  it("desempata bStocks, Ondo, xStocks y marca el empate", () => {
    expect(
      evaluate({
        ticker: "NVDA",
        amountUsd: 200,
        quotes: quotes(0.005, 0.005, 0.009, { xstocks: LIST_DOWN }),
      }),
    ).toMatchObject({ kind: "pass", wrapper: "bstocks", tied: true });

    expect(
      evaluate({
        ticker: "NVDA",
        amountUsd: 200,
        quotes: quotes(0.02, 0.004, 0.004, { xstocks: OK }),
      }),
    ).toMatchObject({ kind: "pass", wrapper: "ondo", tied: true });
  });

  it("decide con un conjunto parcial de cotizaciones y propaga quoteGaps", () => {
    const gaps: QuoteGap[] = [{ wrapper: "xstocks", reason: "NO_QUOTE" }];
    const parciales = quotes(0.002, 0.006, 0.001).filter((q) => q.wrapper !== "xstocks");
    const result = evaluate({
      ticker: "NVDA",
      amountUsd: 200,
      quotes: parciales,
      quoteGaps: gaps,
    });

    passOrFail(result);
    expect(result.wrapper).toBe("bstocks");
    expect(result.quotes.map((q) => q.wrapper)).toEqual(["bstocks", "ondo"]);
    expect(result.quoteGaps).toEqual(gaps);
  });

  it("una sola cotización válida alcanza para decidir", () => {
    const result = evaluate({
      ticker: "NVDA",
      amountUsd: 200,
      quotes: quotes(0.002, 0.006, 0.001).filter((q) => q.wrapper === "ondo"),
    });

    passOrFail(result);
    expect(result.wrapper).toBe("ondo");
    expect(result.tied).toBe(false);
  });

  it("propaga quoteGaps al cut de la pregunta 2 y al «sin dato» de cero cotizaciones", () => {
    const gaps: QuoteGap[] = [{ wrapper: "xstocks", reason: "NO_QUOTE" }];
    const cut = evaluate({
      ticker: "NVDA",
      amountUsd: 10_000,
      quotes: quotes(0.018, 0.063, 0.02).filter((q) => q.wrapper !== "xstocks"),
      quoteGaps: gaps,
    });
    expect(cut).toMatchObject({
      kind: "cut",
      question: 2,
      reason: "IMPACT_OVER_LIMIT",
      quoteGaps: gaps,
    });

    const todosLosGaps: QuoteGap[] = [
      { wrapper: "bstocks", reason: "NO_QUOTE" },
      { wrapper: "ondo", reason: "NOT_LISTED" },
      { wrapper: "xstocks", reason: "NO_QUOTE" },
    ];
    expect(
      evaluate({ ticker: "NVDA", amountUsd: 200, quotes: "unavailable", quoteGaps: todosLosGaps }),
    ).toEqual({
      kind: "unavailable",
      question: 2,
      reason: "QUOTES_UNAVAILABLE",
      quoteGaps: todosLosGaps,
    });
  });

  it("no inventa un precio si las cotizaciones no sirven", () => {
    expect(
      evaluate({ ticker: "NVDA", amountUsd: 200, quotes: "unavailable" }),
    ).toEqual({ kind: "unavailable", question: 2, reason: "QUOTES_UNAVAILABLE" });

    // Cero válidas, duplicadas o malformadas: sigue «sin dato», nunca un número inventado.
    expect(evaluate({ ticker: "NVDA", amountUsd: 200, quotes: [] }).kind).toBe("unavailable");

    const broken = quotes(0.001, 0.001, 0.001);
    broken[0] = { ...broken[0], impactRatio: Number.NaN };
    expect(
      evaluate({ ticker: "NVDA", amountUsd: 200, quotes: broken }).kind,
    ).toBe("unavailable");

    const duplicadas = quotes(0.001, 0.001, 0.001);
    duplicadas[0] = { ...duplicadas[0], wrapper: "ondo" };
    expect(
      evaluate({ ticker: "NVDA", amountUsd: 200, quotes: duplicadas }).kind,
    ).toBe("unavailable");
  });

  it("pasa con referencia, régimen y bloque de salida cuando llegan los datos", () => {
    const exit = {
      now: { recoveredUsd: 198, costRatio: 0.009, simulatedAt: "2026-09-28T12:00:00Z" },
      availability: "unavailable" as const,
      risk: "unavailable" as const,
    };
    const result = evaluate({
      ticker: "QQQB",
      amountUsd: 200,
      quotes: quotes(0.004, 0.008, 0.012),
      reference: { referenceUsd: 500, poolUsd: 510, multiplierNote: "none" },
      regime: { marketStatus: "closed", nextOpenAt: "2026-09-28T13:30:00Z" },
      exit,
    });

    passOrFail(result);
    expect(result.reference.deviationRatio).toBeCloseTo(0.02);
    expect(result.regime.marketStatus).toBe("closed");
    expect(result.exit).toEqual(exit);
  });

  it("las preguntas 3 y 4 y la salida quedan «sin dato» si no llegan datos", () => {
    const result = evaluate({
      ticker: "NVDA",
      amountUsd: 200,
      quotes: quotes(0.004, 0.008, 0.012),
    });

    passOrFail(result);
    expect(result.reference).toEqual({
      referenceUsd: "unavailable",
      poolUsd: "unavailable",
      deviationRatio: "unavailable",
      multiplierNote: "unavailable",
    });
    expect(result.regime.marketStatus).toBe("unavailable");
    expect(result.exit).toEqual({
      now: "unavailable",
      availability: "unavailable",
      risk: "unavailable",
    });
  });

  it("registra los topes de la frase que no se cumplieron, sin decidir", () => {
    const result = evaluate({
      ticker: "NVDA",
      amountUsd: 200,
      quotes: quotes(0.004, 0.008, 0.012),
      reference: { referenceUsd: 500, poolUsd: 520 },
      constraints: { maxImpactRatio: 0.003, maxDeviationRatio: 0.02 },
    });

    passOrFail(result);
    expect(result.constraints?.violated).toEqual([
      "MAX_IMPACT_RATIO",
      "MAX_DEVIATION_RATIO",
    ]);
  });

  it("los ejemplos de la pantalla cubren los estados y el bloque de salida", () => {
    expect(evaluationExamples.invalid.kind).toBe("invalid");
    expect(evaluationExamples.unavailable).toMatchObject({
      kind: "unavailable",
      question: 1,
    });
    expect(evaluationExamples.cutQuestion1).toMatchObject({
      kind: "cut",
      question: 1,
      reason: "CONTRACT_NOT_LISTED",
    });
    expect(evaluationExamples.cutQuestion2).toMatchObject({
      kind: "cut",
      question: 2,
      reason: "IMPACT_OVER_LIMIT",
    });
    expect(evaluationExamples.pass).toMatchObject({ kind: "pass", wrapper: "bstocks" });
    expect(evaluationExamples.passThinNameSinDato).toMatchObject({
      kind: "pass",
      regime: { marketStatus: "closed" },
      exit: { availability: "unavailable" },
    });
  });
});
