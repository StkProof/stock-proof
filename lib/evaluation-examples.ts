import { evaluate, type ExitBlock, type Quote } from "@/lib/evaluate";

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

const liquidExit: ExitBlock = {
  now: {
    recoveredUsd: 198.4,
    costRatio: 0.008,
    simulatedAt: "2026-09-28T12:00:05Z",
  },
  availability: {
    marketStatus: "closed",
    nextOpenAt: "2026-09-28T13:30:00Z",
    mintRedeemHours: "unavailable",
    redemptionVenue: "Binance (conversión 1:1, no en el pool)",
    source: { name: "Binance RWA Data" },
  },
  risk: [
    {
      code: "POOL_DISPERSION",
      value: 0.012,
      source: { name: "Binance Market API" },
      observedAt: "2026-09-28T12:00:00Z",
    },
  ],
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

  /** Monto que ningún pool absorbe a ≤ 1% (escena 2 del video). */
  cutQuestion2: evaluate({
    ticker: "NVDA",
    amountUsd: 10_000,
    quotes: quotes(0.018, 0.063, 0.02, 10_000),
  }),

  /** Monto chico en nombre líquido: pasa con referencia, régimen y bloque de salida (escena 1). */
  pass: evaluate({
    ticker: "QQQB",
    amountUsd: 200,
    quotes: quotes(0.004, 0.008, 0.012),
    reference: { referenceUsd: 500.12, poolUsd: 500.9, multiplierNote: "none" },
    regime: {
      marketStatus: "closed",
      nextOpenAt: "2026-09-28T13:30:00Z",
      poolsAgree: true,
      bookFrozen: false,
    },
    exit: liquidExit,
  }),

  /**
   * Nombre fino un sábado (escena 5): pasa, pero el mercado está cerrado y el bloque
   * de salida muestra qué se recupera ahora, cuándo abre y qué señales hay.
   * `exit.availability` llega en «sin dato» para mostrar ese camino también.
   */
  passThinNameSinDato: evaluate({
    ticker: "SPCXB",
    amountUsd: 45,
    quotes: quotes(0.009, 0.011, 0.015, 45),
    regime: {
      marketStatus: "closed",
      nextOpenAt: "2026-09-28T13:30:00Z",
      bookFrozen: true,
      suggestSplit: true,
    },
    exit: {
      now: {
        recoveredUsd: 44.2,
        costRatio: 0.018,
        simulatedAt: "2026-09-27T18:12:00Z",
      },
      availability: "unavailable",
      risk: [
        {
          code: "OFF_HOURS_WEEKEND",
          value: "emisor fuera de horario de EE. UU.",
          source: { name: "Binance RWA Data" },
          observedAt: "2026-09-27T18:00:00Z",
        },
      ],
    },
  }),
} as const;
