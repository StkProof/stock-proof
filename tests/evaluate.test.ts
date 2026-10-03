import { describe, expect, it } from "vitest";
import {
  evaluate,
  IMPACT_LIMIT,
  type Evaluation,
  type ExitBlock,
  type Quote,
  type QuoteGap,
  type WrapperExit,
  type WrapperId,
} from "@/lib/evaluate";
import { evaluationExamples } from "@/lib/evaluation-examples";
import type { Q1Result } from "@/lib/questions/q1-reasons";
import type { Q3Input } from "@/lib/questions/q3";

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

function sell(costRatio: number, recoveredUsd = 198): ExitBlock["now"] {
  return { recoveredUsd, costRatio, simulatedAt: "2026-09-28T12:00:00Z" };
}

/** Salidas por wrapper cotizado; `availability` queda «sin dato» salvo que se pida. */
function exits(
  now: Partial<Record<WrapperId, ExitBlock["now"]>>,
  availability: Partial<Record<WrapperId, ExitBlock["availability"]>> = {},
): WrapperExit[] {
  return (Object.keys(now) as WrapperId[]).map((wrapper) => ({
    wrapper,
    now: now[wrapper] ?? "unavailable",
    availability: availability[wrapper] ?? "unavailable",
  }));
}

/** Los tres con compra y venta medidas bajo el tope. */
const LIQUID_EXITS = exits({
  bstocks: sell(0.008),
  ondo: sell(0.009),
  xstocks: sell(0.007),
});

/** Precio del token que coincide con el de la acción: la pregunta 3 pasa. */
function prices(
  entries: Partial<Record<WrapperId, Omit<Q3Input, "wrapper">>>,
): Q3Input[] {
  return (Object.keys(entries) as WrapperId[]).map((wrapper) => ({
    wrapper,
    tokenPriceUsd: "unavailable",
    referenceUsd: "unavailable",
    ...entries[wrapper],
  }));
}

/** Los tres wrappers con el precio del token igual al de la acción: la pregunta 3 pasa. */
const MATCHING_PRICES = prices({
  bstocks: { tokenPriceUsd: 500.12, referenceUsd: 500.12 },
  ondo: { tokenPriceUsd: 500.12, referenceUsd: 500.12 },
  xstocks: { tokenPriceUsd: 500.12, referenceUsd: 500.12 },
});

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
      exits: LIQUID_EXITS,
      reference: MATCHING_PRICES,
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

  it("con compra y venta bajo el tope pasa y nombra el wrapper de menor impacto de compra", () => {
    const result = evaluate({
      ticker: "NVDA",
      amountUsd: 200,
      quotes: quotes(0.004, 0.008, IMPACT_LIMIT, { xstocks: OK }),
      exits: LIQUID_EXITS,
      reference: MATCHING_PRICES,
    });

    expect(result).toMatchObject({
      kind: "pass",
      wrapper: "bstocks",
      address: ADDR.bstocks,
      impactRatio: 0.004,
      simulatedCostUsd: 90,
      tied: false,
    });
    // El bloque de salida del ganador es su venta medida.
    passOrFail(result);
    expect(result.exit.now).toEqual(sell(0.008));
    // Sin datos de régimen la pregunta 4 no corta: queda declarada «sin dato».
    expect(result.regime.marketStatus).toBe("unavailable");
  });

  it("acepta una compra y una venta exactamente del 1%", () => {
    const result = evaluate({
      ticker: "SPY",
      amountUsd: 200,
      quotes: quotes(0.02, IMPACT_LIMIT, 0.05, { xstocks: LIST_DOWN }),
      exits: exits({ ondo: sell(IMPACT_LIMIT) }),
      reference: MATCHING_PRICES,
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

  it("desempata bStocks, Ondo, xStocks entre los que pueden firmar y marca el empate", () => {
    expect(
      evaluate({
        ticker: "NVDA",
        amountUsd: 200,
        quotes: quotes(0.005, 0.005, 0.009, { xstocks: LIST_DOWN }),
        exits: LIQUID_EXITS,
        reference: MATCHING_PRICES,
      }),
    ).toMatchObject({ kind: "pass", wrapper: "bstocks", tied: true });

    expect(
      evaluate({
        ticker: "NVDA",
        amountUsd: 200,
        quotes: quotes(0.02, 0.004, 0.004, { xstocks: OK }),
        exits: LIQUID_EXITS,
        reference: MATCHING_PRICES,
      }),
    ).toMatchObject({ kind: "pass", wrapper: "ondo", tied: true });
  });

  it("el empate no cuenta un wrapper cuya venta no pasa el tope", () => {
    const result = evaluate({
      ticker: "NVDA",
      amountUsd: 200,
      quotes: quotes(0.005, 0.005, 0.009, { xstocks: LIST_DOWN }),
      exits: exits({ bstocks: sell(0.008), ondo: sell(0.03) }),
      reference: MATCHING_PRICES,
    });

    expect(result).toMatchObject({ kind: "pass", wrapper: "bstocks", tied: false });
  });

  it("firma el siguiente wrapper cuando el de menor compra no puede salir bajo el tope", () => {
    const result = evaluate({
      ticker: "SPCXB",
      amountUsd: 45,
      quotes: quotes(0.002, 0.005, 0.009, { xstocks: LIST_DOWN }),
      exits: exits({ bstocks: sell(0.03), ondo: sell(0.008) }),
      reference: MATCHING_PRICES,
    });

    passOrFail(result);
    expect(result.wrapper).toBe("ondo");
  });

  it("corta con la venta medida sobre el tope y muestra su costo", () => {
    const exitList = exits({ bstocks: sell(0.024), ondo: sell(0.031) });
    const result = evaluate({
      ticker: "SPCXB",
      amountUsd: 2_000,
      quotes: quotes(0.008, 0.011, 0.015, { xstocks: LIST_DOWN }),
      exits: exitList,
    });

    expect(result).toMatchObject({
      kind: "cut",
      question: 2,
      reason: "EXIT_OVER_LIMIT",
      exits: exitList,
    });
    if (result.kind === "cut" && "exits" in result) {
      expect(result.exits?.find((exit) => exit.wrapper === "bstocks")?.now).toMatchObject({
        costRatio: 0.024,
      });
    }
  });

  it("la venta medida sobre el tope gana al «sin cotización» de otro wrapper", () => {
    const result = evaluate({
      ticker: "SPCXB",
      amountUsd: 2_000,
      quotes: quotes(0.008, 0.011, 0.015, { xstocks: LIST_DOWN }),
      exits: exits({ bstocks: sell(0.024), ondo: "unavailable" }),
    });

    expect(result).toMatchObject({ kind: "cut", question: 2, reason: "EXIT_OVER_LIMIT" });
  });

  it("sin cotización de venta no se firma: el wrapper no tiene salida medible", () => {
    const exitList = exits({ bstocks: "unavailable", ondo: "unavailable" });
    const result = evaluate({
      ticker: "NVDA",
      amountUsd: 200,
      quotes: quotes(0.004, 0.008, 0.012, { xstocks: LIST_DOWN }),
      exits: exitList,
    });

    expect(result).toEqual({
      kind: "unavailable",
      question: 2,
      reason: "EXIT_NOW_UNAVAILABLE",
      quotes: expect.any(Array),
      exits: exitList,
    });
  });

  it("sin `exits` en la entrada tampoco se firma: la venta no se midió para nadie", () => {
    expect(
      evaluate({
        ticker: "NVDA",
        amountUsd: 200,
        quotes: quotes(0.004, 0.008, 0.012, { xstocks: LIST_DOWN }),
      }),
    ).toMatchObject({
      kind: "unavailable",
      question: 2,
      reason: "EXIT_NOW_UNAVAILABLE",
    });
  });

  it("una venta malformada cuenta como no medida y ese wrapper no firma", () => {
    const result = evaluate({
      ticker: "NVDA",
      amountUsd: 200,
      quotes: quotes(0.004, 0.008, 0.012, { xstocks: LIST_DOWN }),
      exits: [
        {
          wrapper: "bstocks",
          now: { recoveredUsd: Number.NaN, costRatio: 0.001, simulatedAt: "2026-09-28T12:00:00Z" },
          availability: "unavailable",
        },
        { wrapper: "ondo", now: sell(0.009), availability: "unavailable" },
      ],
      reference: MATCHING_PRICES,
    });

    passOrFail(result);
    expect(result.wrapper).toBe("ondo");
    expect(result.exits?.find((exit) => exit.wrapper === "bstocks")?.now).toBe("unavailable");
  });

  it("de un wrapper repetido vale la primera venta y un wrapper desconocido se ignora", () => {
    const result = evaluate({
      ticker: "NVDA",
      amountUsd: 200,
      quotes: quotes(0.004, 0.008, 0.012, { xstocks: LIST_DOWN }),
      exits: [
        { wrapper: "bstocks", now: sell(0.02), availability: "unavailable" },
        { wrapper: "bstocks", now: sell(0.001), availability: "unavailable" },
        { wrapper: "otro" as WrapperId, now: sell(0.001), availability: "unavailable" },
      ],
      reference: MATCHING_PRICES,
    });

    expect(result).toMatchObject({ kind: "cut", question: 2, reason: "EXIT_OVER_LIMIT" });
    if (result.kind !== "cut" || result.question !== 2) return;
    expect(result.exits).toEqual([
      { wrapper: "bstocks", now: sell(0.02), availability: "unavailable" },
    ]);
  });

  it("decide con un conjunto parcial de cotizaciones y propaga quoteGaps", () => {
    const gaps: QuoteGap[] = [{ wrapper: "xstocks", reason: "NO_QUOTE" }];
    const parciales = quotes(0.002, 0.006, 0.001).filter((q) => q.wrapper !== "xstocks");
    const result = evaluate({
      ticker: "NVDA",
      amountUsd: 200,
      quotes: parciales,
      quoteGaps: gaps,
      exits: exits({ bstocks: sell(0.008), ondo: sell(0.009) }),
      reference: MATCHING_PRICES,
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
      exits: exits({ ondo: sell(0.008) }),
      reference: MATCHING_PRICES,
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

  it("un desvío de Ondo explicado por el retorno total sigue y queda en la referencia", () => {
    const result = evaluate({
      ticker: "NVDA",
      amountUsd: 200,
      quotes: quotes(0.008, 0.002, 0.001, { xstocks: LIST_DOWN }),
      exits: LIQUID_EXITS,
      reference: prices({
        ondo: { tokenPriceUsd: 255, referenceUsd: 250 },
        bstocks: { tokenPriceUsd: 250, referenceUsd: 250 },
      }),
    });

    passOrFail(result);
    expect(result.wrapper).toBe("ondo");
    expect(result.reference).toMatchObject({
      referenceUsd: 250,
      poolUsd: 255,
      multiplierNote: "total-return",
    });
    expect(result.reference.deviationRatio).toBeCloseTo(0.02);
  });

  it("un desvío explicado por el multiplicador de acciones también sigue", () => {
    const result = evaluate({
      ticker: "NVDA",
      amountUsd: 200,
      quotes: quotes(0.004, 0.008, 0.012, { xstocks: LIST_DOWN }),
      exits: LIQUID_EXITS,
      reference: prices({
        bstocks: { tokenPriceUsd: 250.2, referenceUsd: 250, sharesMultiplier: 1.0008 },
      }),
    });

    passOrFail(result);
    expect(result.wrapper).toBe("bstocks");
    expect(result.reference.multiplierNote).toBe("multiplier");
  });

  it("un desvío sin explicación corta en la pregunta 3 con la referencia del candidato", () => {
    const reference = prices({
      bstocks: { tokenPriceUsd: 260, referenceUsd: 250, sharesMultiplier: 1 },
    });
    const result = evaluate({
      ticker: "NVDA",
      amountUsd: 200,
      quotes: quotes(0.004, 0.008, 0.012, { xstocks: LIST_DOWN }),
      exits: LIQUID_EXITS,
      reference,
    });

    expect(result).toMatchObject({
      kind: "cut",
      question: 3,
      reason: "DEVIATION_UNEXPLAINED",
      wrapper: "bstocks",
      reference: { referenceUsd: 250, poolUsd: 260 },
    });
  });

  it("un precio que no llegó frena la pregunta 3 sin firmar (fail closed)", () => {
    // Sin entrada de referencia para el ganador: «no se pudo evaluar», no es un corte.
    const sinReferencia = evaluate({
      ticker: "NVDA",
      amountUsd: 200,
      quotes: quotes(0.004, 0.008, 0.012, { xstocks: LIST_DOWN }),
      exits: LIQUID_EXITS,
    });
    expect(sinReferencia).toMatchObject({
      kind: "unavailable",
      question: 3,
      reason: "TOKEN_PRICE_UNAVAILABLE",
    });

    // El subyacente fuera de rueda (null) tampoco inventa: es el otro precio el que falta.
    const sinAccion = evaluate({
      ticker: "NVDA",
      amountUsd: 200,
      quotes: quotes(0.004, 0.008, 0.012, { xstocks: LIST_DOWN }),
      exits: LIQUID_EXITS,
      reference: prices({
        bstocks: { tokenPriceUsd: 250, referenceUsd: null },
      }),
    });
    expect(sinAccion).toMatchObject({
      kind: "unavailable",
      question: 3,
      reason: "REFERENCE_PRICE_UNAVAILABLE",
    });
  });

  it("el sábado con libro clavado y pools que coinciden pasa y el régimen lo declara", () => {
    const result = evaluate({
      ticker: "QQQB",
      amountUsd: 200,
      quotes: quotes(0.004, 0.008, 0.012, { xstocks: LIST_DOWN }),
      exits: LIQUID_EXITS,
      reference: prices({
        bstocks: { tokenPriceUsd: 500.12, referenceUsd: 500.12 },
      }),
      regime: {
        marketStatus: "closed",
        nextOpenAt: "2026-09-28T13:30:00Z",
        poolsDiffRatio: 0.0005,
        bookFrozen: true,
      },
    });

    passOrFail(result);
    expect(result.regime).toMatchObject({
      marketStatus: "closed",
      poolsAgree: true,
      bookFrozen: true,
    });
  });

  it("los pools que no coinciden cortan en la pregunta 4 con el régimen medido", () => {
    const result = evaluate({
      ticker: "SPCXB",
      amountUsd: 45,
      quotes: quotes(0.004, 0.008, 0.012, { xstocks: LIST_DOWN }),
      exits: LIQUID_EXITS,
      reference: prices({
        bstocks: { tokenPriceUsd: 500.12, referenceUsd: 500.12 },
      }),
      regime: { marketStatus: "open", poolsDiffRatio: 0.004, bookFrozen: true },
    });

    expect(result).toMatchObject({
      kind: "cut",
      question: 4,
      reason: "POOLS_DISAGREE",
      wrapper: "bstocks",
      regime: { poolsAgree: false, bookFrozen: true },
    });
  });

  it("sin dato de pools no corta ni inventa acuerdo: queda «sin dato»", () => {
    const result = evaluate({
      ticker: "NVDA",
      amountUsd: 200,
      quotes: quotes(0.004, 0.008, 0.012, { xstocks: LIST_DOWN }),
      exits: LIQUID_EXITS,
      reference: prices({
        bstocks: { tokenPriceUsd: 500.12, referenceUsd: 500.12 },
      }),
      regime: { marketStatus: "closed" },
    });

    passOrFail(result);
    expect(result.regime.poolsAgree).toBe("unavailable");
  });

  it("la disponibilidad de salida ausente no elimina a nadie: queda «sin dato»", () => {
    const result = evaluate({
      ticker: "NVDA",
      amountUsd: 200,
      quotes: quotes(0.004, 0.008, 0.012, { xstocks: LIST_DOWN }),
      exits: LIQUID_EXITS,
      reference: prices({
        bstocks: { tokenPriceUsd: 500.12, referenceUsd: 500.12 },
      }),
    });

    passOrFail(result);
    expect(result.exit.availability).toBe("unavailable");
    expect(result.exit.risk).toBe("unavailable");
  });

  it("la disponibilidad del ganador viaja al bloque de salida", () => {
    const availability: ExitBlock["availability"] = {
      marketStatus: "closed",
      nextOpenAt: "2026-09-28T13:30:00Z",
      mintRedeemHours: "unavailable",
      redemptionVenue: "Binance (conversión 1:1, no en el pool)",
      source: { name: "Binance RWA Data" },
    };
    const result = evaluate({
      ticker: "QQQB",
      amountUsd: 200,
      quotes: quotes(0.004, 0.008, 0.012, { xstocks: LIST_DOWN }),
      exits: exits(
        { bstocks: sell(0.008), ondo: sell(0.009) },
        { bstocks: availability },
      ),
      reference: prices({
        bstocks: { tokenPriceUsd: 500.12, referenceUsd: 500.12 },
      }),
    });

    passOrFail(result);
    expect(result.exit.availability).toEqual(availability);
  });

  it("registra los topes de la frase que no se cumplieron, sin decidir", () => {
    const result = evaluate({
      ticker: "NVDA",
      amountUsd: 200,
      quotes: quotes(0.004, 0.002, 0.012, { xstocks: LIST_DOWN }),
      exits: LIQUID_EXITS,
      reference: prices({
        // Ondo explica un desvío grande como retorno total: la frase lo registra igual.
        ondo: { tokenPriceUsd: 560, referenceUsd: 500 },
      }),
      constraints: { maxImpactRatio: 0.001, maxDeviationRatio: 0.02 },
    });

    passOrFail(result);
    expect(result.wrapper).toBe("ondo");
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
    expect(evaluationExamples.cutExitNow).toMatchObject({
      kind: "cut",
      question: 2,
      reason: "EXIT_OVER_LIMIT",
    });
    expect(evaluationExamples.pass).toMatchObject({ kind: "pass", wrapper: "bstocks" });
    expect(evaluationExamples.passThinNameSinDato).toMatchObject({
      kind: "pass",
      regime: { marketStatus: "closed", bookFrozen: true },
      exit: { availability: "unavailable" },
    });
  });
});
