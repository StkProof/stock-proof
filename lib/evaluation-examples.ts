import { evaluate, type Quote } from "@/lib/evaluate";

const official = { listed: true, attested: true, standardOk: true };

function quotes(
  bstocks: number,
  ondo: number,
  xstocks: number,
): Quote[] {
  return [
    { wrapper: "xstocks", impactRatio: xstocks, simulatedCostUsd: 200 * (1 + xstocks) },
    { wrapper: "bstocks", impactRatio: bstocks, simulatedCostUsd: 200 * (1 + bstocks) },
    { wrapper: "ondo", impactRatio: ondo, simulatedCostUsd: 200 * (1 + ondo) },
  ];
}

/** Los cinco estados que la pantalla tiene que poder mostrar, salidos de evaluate. */
export const evaluationExamples = {
  invalid: evaluate({
    ticker: " ",
    amountUsd: 0,
    authenticity: official,
    quotes: quotes(0.001, 0.002, 0.003),
  }),
  unavailable: evaluate({
    ticker: "NVDA",
    amountUsd: 200,
    authenticity: "unavailable",
    quotes: quotes(0.001, 0.002, 0.003),
  }),
  cutQuestion1: evaluate({
    ticker: "NVDA",
    amountUsd: 200,
    authenticity: { listed: false, attested: false, standardOk: false },
    quotes: quotes(0.001, 0.002, 0.003),
  }),
  cutQuestion2: evaluate({
    ticker: "NVDA",
    amountUsd: 10_000,
    authenticity: official,
    quotes: quotes(0.018, 0.063, 0.02),
  }),
  pass: evaluate({
    ticker: "NVDA",
    amountUsd: 200,
    authenticity: official,
    quotes: quotes(0.004, 0.008, 0.012),
  }),
} as const;
