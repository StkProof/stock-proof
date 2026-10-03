import { evaluate, type ExitBlock, type Quote, type WrapperExit } from "@/lib/evaluate";
import type { Q3Input } from "@/lib/questions/q3";

const OK = { ok: true } as const;

/** Direcciones de ejemplo con formato BSC (no son contratos reales). */
const ADDR = {
  bstocks: "0x0000000000000000000000000000000000000b51",
  ondo: "0x0000000000000000000000000000000000000bd0",
  xstocks: "0x0000000000000000000000000000000000000c51",
  impostor: "0x000000000000000000000000000000000000dead",
} as const;

function quotes(
  bstocks: number,
  ondo: number,
  xstocks: number,
  amountUsd = 200,
): Quote[] {
  return [
    {
      wrapper: "xstocks",
      address: ADDR.xstocks,
      side: "buy",
      impactRatio: xstocks,
      simulatedCostUsd: amountUsd * (1 + xstocks),
      // xStocks no tiene lista oficial en Binance: nunca es elegible (ADR 0002).
      authenticity: { ok: false, reason: "LIST_UNAVAILABLE" },
    },
    {
      wrapper: "bstocks",
      address: ADDR.bstocks,
      side: "buy",
      impactRatio: bstocks,
      simulatedCostUsd: amountUsd * (1 + bstocks),
      authenticity: OK,
    },
    {
      wrapper: "ondo",
      address: ADDR.ondo,
      side: "buy",
      impactRatio: ondo,
      simulatedCostUsd: amountUsd * (1 + ondo),
      authenticity: OK,
    },
  ];
}

function sell(recoveredUsd: number, costRatio: number): ExitBlock["now"] {
  return { recoveredUsd, costRatio, simulatedAt: "2026-09-27T18:12:00Z" };
}

/** Salidas por wrapper cotizado: `now` es la compuerta; `availability` informa. */
function exits(
  now: Partial<Record<Quote["wrapper"], ExitBlock["now"]>>,
  availability: Partial<Record<Quote["wrapper"], ExitBlock["availability"]>> = {},
): WrapperExit[] {
  return (Object.keys(now) as Quote["wrapper"][]).map((wrapper) => ({
    wrapper,
    now: now[wrapper] ?? "unavailable",
    availability: availability[wrapper] ?? "unavailable",
  }));
}

/** Precios crudos de la pregunta 3, uno por wrapper cotizado. */
function prices(
  entries: Partial<Record<Quote["wrapper"], Omit<Q3Input, "wrapper">>>,
): Q3Input[] {
  return (Object.keys(entries) as Quote["wrapper"][]).map((wrapper) => ({
    wrapper,
    tokenPriceUsd: "unavailable",
    referenceUsd: "unavailable",
    ...entries[wrapper],
  }));
}

const bstocksAvailability: ExitBlock["availability"] = {
  marketStatus: "closed",
  nextOpenAt: "2026-09-28T13:30:00Z",
  mintRedeemHours: "unavailable",
  redemptionVenue: "Binance (conversión 1:1, no en el pool)",
  source: { name: "Binance RWA Data" },
};

/** Estados que la pantalla tiene que poder mostrar, salidos de evaluate. */
export const evaluationExamples = {
  invalid: evaluate({
    ticker: " ",
    amountUsd: 0,
    quotes: quotes(0.001, 0.002, 0.003),
  }),

  /** La lista oficial no respondió: no se pudo evaluar la pregunta 1 (fail closed). */
  unavailable: evaluate({
    ticker: "NVDA",
    amountUsd: 200,
    target: { address: ADDR.impostor, check: "unavailable" },
    quotes: quotes(0.001, 0.002, 0.003),
  }),

  /** El usuario pegó una dirección que no es la oficial: impostor (escena 3 del video). */
  cutQuestion1: evaluate({
    ticker: "NVDA",
    amountUsd: 200,
    target: {
      address: ADDR.impostor,
      check: { ok: false, reason: "CONTRACT_NOT_LISTED" },
    },
    quotes: quotes(0.001, 0.002, 0.003),
  }),

  /** Monto que ningún pool absorbe a ≤ 1% en la compra (escena 2 del video). */
  cutQuestion2: evaluate({
    ticker: "NVDA",
    amountUsd: 10_000,
    quotes: quotes(0.018, 0.063, 0.02, 10_000),
    exits: exits(
      { bstocks: sell(9_500, 0.05), ondo: sell(8_900, 0.11) },
      { bstocks: bstocksAvailability },
    ),
  }),

  /**
   * La compra entra pero vender el mismo monto ahora supera el tope: el corte del
   * nombre fino un sábado (escena extra del video, `Diferenciador.md`). La venta
   * medida se muestra en la tabla de salidas.
   */
  cutExitNow: evaluate({
    ticker: "SPCXB",
    amountUsd: 2_000,
    quotes: quotes(0.008, 0.011, 0.015, 2_000),
    exits: exits(
      { bstocks: sell(1_952, 0.024), ondo: sell(1_940, 0.03) },
      { bstocks: bstocksAvailability },
    ),
  }),

  /** Monto chico en nombre líquido: pasa con referencia, régimen y bloque de salida (escena 1). */
  pass: evaluate({
    ticker: "QQQB",
    amountUsd: 200,
    quotes: quotes(0.004, 0.008, 0.012),
    exits: exits(
      // Ondo también entraba barato, pero su venta medida pasa del tope: no se firma.
      { bstocks: sell(198.4, 0.008), ondo: sell(197.6, 0.012), xstocks: "unavailable" },
      { bstocks: bstocksAvailability },
    ),
    reference: prices({
      bstocks: { tokenPriceUsd: 500.12, referenceUsd: 500.12, sharesMultiplier: 1.0008 },
      ondo: { tokenPriceUsd: 512.4, referenceUsd: 500.12 },
      xstocks: { tokenPriceUsd: 500.3, referenceUsd: 500.12, sharesMultiplier: 1 },
    }),
    regime: {
      marketStatus: "closed",
      nextOpenAt: "2026-09-28T13:30:00Z",
      poolsDiffRatio: 0.0002,
      bookFrozen: true,
    },
  }),

  /**
   * Nombre fino un sábado con monto chico (escena 5): la venta de US$ 45 sí se midió
   * bajo el tope, así que firma, pero el mercado está cerrado, el libro queda clavado
   * en el comprobante y la disponibilidad de salida llega en «sin dato».
   */
  passThinNameSinDato: evaluate({
    ticker: "SPCXB",
    amountUsd: 45,
    quotes: quotes(0.009, 0.011, 0.015, 45),
    exits: exits({ bstocks: sell(44.6, 0.009), ondo: "unavailable" }),
    reference: prices({
      bstocks: { tokenPriceUsd: 412.8, referenceUsd: 412.8 },
      ondo: { tokenPriceUsd: "unavailable", referenceUsd: 412.8 },
    }),
    regime: {
      marketStatus: "closed",
      nextOpenAt: "2026-09-28T13:30:00Z",
      bookFrozen: true,
      suggestSplit: true,
    },
  }),
} as const;
