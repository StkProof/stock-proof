/** Umbral de impacto de la pregunta 2: 1% = 0.01. */
export const IMPACT_LIMIT = 0.01;

/** Orden de desempate cuando el impacto es igual. El primero gana. */
export const WRAPPERS = ["bstocks", "ondo", "xstocks"] as const;

export type WrapperId = (typeof WRAPPERS)[number];

export type Quote = {
  wrapper: WrapperId;
  /** 0.01 equivale a 1% de impacto. */
  impactRatio: number;
  simulatedCostUsd: number;
};

export type Authenticity = {
  listed: boolean;
  attested: boolean;
  /** En bStocks esto es BEP-8056. En los otros wrappers, el estándar que publique la lista oficial. */
  standardOk: boolean;
};

export type EvaluateInput = {
  ticker: string;
  amountUsd: number;
  authenticity: Authenticity | "unavailable";
  quotes: Quote[] | "unavailable";
};

export type Evaluation =
  | { kind: "invalid" }
  | { kind: "unavailable" }
  | { kind: "cut"; question: 1 }
  | { kind: "cut"; question: 2; quotes: Quote[] }
  | {
      kind: "pass";
      wrapper: WrapperId;
      impactRatio: number;
      simulatedCostUsd: number;
      tied: boolean;
      quotes: Quote[];
    };

/**
 * Preguntas 1 y 2. No llama a la red: quien consulta las APIs arma la entrada.
 * La pregunta 1 se resuelve antes que la 2. Si corta, las cotizaciones no importan.
 */
export function evaluate(input: EvaluateInput): Evaluation {
  const ticker = input.ticker.trim();
  if (
    ticker.length === 0 ||
    !Number.isFinite(input.amountUsd) ||
    input.amountUsd <= 0
  ) {
    return { kind: "invalid" };
  }

  if (input.authenticity === "unavailable") {
    return { kind: "unavailable" };
  }

  if (!isOfficial(input.authenticity)) {
    return { kind: "cut", question: 1 };
  }

  const quotes = normalizeQuotes(input.quotes);
  if (quotes === null) {
    return { kind: "unavailable" };
  }

  const eligible = quotes.filter((quote) => quote.impactRatio <= IMPACT_LIMIT);
  if (eligible.length === 0) {
    return { kind: "cut", question: 2, quotes };
  }

  const bestImpact = Math.min(...eligible.map((quote) => quote.impactRatio));
  const atBest = eligible.filter((quote) => quote.impactRatio === bestImpact);
  const winner = WRAPPERS.map((wrapper) =>
    atBest.find((quote) => quote.wrapper === wrapper),
  ).find((quote): quote is Quote => quote !== undefined);

  if (winner === undefined) {
    return { kind: "unavailable" };
  }

  return {
    kind: "pass",
    wrapper: winner.wrapper,
    impactRatio: winner.impactRatio,
    simulatedCostUsd: winner.simulatedCostUsd,
    tied: atBest.length > 1,
    quotes,
  };
}

function isOfficial(authenticity: Authenticity): boolean {
  return authenticity.listed && authenticity.attested && authenticity.standardOk;
}

/** Devuelve las tres cotizaciones en orden estable, o null si el conjunto no sirve. */
function normalizeQuotes(quotes: Quote[] | "unavailable"): Quote[] | null {
  if (quotes === "unavailable") {
    return null;
  }

  const byWrapper = new Map<WrapperId, Quote>();
  for (const quote of quotes) {
    if (byWrapper.has(quote.wrapper)) {
      return null;
    }
    if (
      !Number.isFinite(quote.impactRatio) ||
      !Number.isFinite(quote.simulatedCostUsd)
    ) {
      return null;
    }
    byWrapper.set(quote.wrapper, quote);
  }

  if (byWrapper.size !== WRAPPERS.length) {
    return null;
  }

  const ordered: Quote[] = [];
  for (const wrapper of WRAPPERS) {
    const quote = byWrapper.get(wrapper);
    if (quote === undefined) {
      return null;
    }
    ordered.push(quote);
  }
  return ordered;
}
