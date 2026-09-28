import {
  isUnavailableReason,
  type Q1CutReason,
  type Q1Result,
} from "@/lib/questions/q1-reasons";

/** Umbral de impacto de la pregunta 2: 1% = 0.01. */
export const IMPACT_LIMIT = 0.01;

/** Orden de desempate cuando el impacto es igual. El primero gana. */
export const WRAPPERS = ["bstocks", "ondo", "xstocks"] as const;

export type WrapperId = (typeof WRAPPERS)[number];

export type Side = "buy" | "sell";

export type Quote = {
  wrapper: WrapperId;
  /** Contrato en BSC que esta ruta usaría. La pregunta 1 se decide sobre él. */
  address: string;
  /** La entrada es "buy"; Exit Now es la misma simulación con "sell". */
  side: Side;
  /** 0.01 equivale a 1% de impacto. */
  impactRatio: number;
  simulatedCostUsd: number;
  /** Resultado de la pregunta 1 sobre `address`. Solo las cotizaciones con `ok` son elegibles. */
  authenticity: Q1Result;
};

/** Fuente y fecha de un dato publicado o medido. */
export type Source = { name: string; url?: string };

/** Datos de la pregunta 3 («¿este número es la acción?»). */
export type Reference = {
  referenceUsd: number | "unavailable";
  poolUsd: number | "unavailable";
  deviationRatio: number | "unavailable";
  multiplierNote: "none" | "multiplier" | "total-return" | "unavailable";
};

/** Datos de la pregunta 4 («¿en qué régimen está este ticker?»). */
export type Regime = {
  marketStatus: "open" | "closed" | "unavailable";
  /** ISO 8601 UTC. */
  nextOpenAt: string | "unavailable";
  /** Los pools del mismo ticker coinciden entre sí. */
  poolsAgree: boolean | "unavailable";
  /** Libro clavado. */
  bookFrozen: boolean | "unavailable";
  /** La pregunta 4 puede proponer partir la orden en un nombre fino. */
  suggestSplit: boolean;
};

export type RiskSignal = {
  code: string;
  value: number | string;
  source: Source;
  /** ISO 8601 UTC, la fecha del dato. */
  observedAt: string;
};

/**
 * Bloque de salida: se muestra solo cuando las cuatro preguntas pasan.
 * Cada capa puede ser "unavailable" y la pantalla lo lee «sin dato».
 */
export type ExitBlock = {
  /** Simulación de vender el mismo monto ahora, mismo wrapper, este instante. */
  now:
    | {
        recoveredUsd: number;
        /** Comparable con IMPACT_LIMIT: si lo supera, el agente puede negarse igual que en la entrada. */
        costRatio: number;
        /** ISO 8601 UTC; la pantalla muestra la edad («hace 5 s»). */
        simulatedAt: string;
      }
    | "unavailable";
  /** Reglas publicadas: informa, no decide. */
  availability:
    | {
        marketStatus: "open" | "closed";
        nextOpenAt: string | "unavailable";
        /** Horario de mint/redeem publicado por el emisor. */
        mintRedeemHours: string | "unavailable";
        /** Dónde se canjea por la acción; p.ej. «en Binance, no en el pool». */
        redemptionVenue: string | "unavailable";
        source: Source | "unavailable";
      }
    | "unavailable";
  /** Señales observables medidas hoy: informa, no predice. */
  risk: RiskSignal[] | "unavailable";
};

/** Topes que salen de la frase en castellano. Se miran después de las cuatro preguntas. */
export type Constraints = {
  maxImpactRatio?: number;
  maxDeviationRatio?: number;
};

export type ConstraintCode = "MAX_IMPACT_RATIO" | "MAX_DEVIATION_RATIO";

export type QuestionId = 1 | 2 | 3 | 4;

/** Códigos de corte de la pregunta 2. La spec de la pregunta 2 puede sumar. */
export const Q2_CUT_REASONS = ["IMPACT_OVER_LIMIT"] as const;
export type Q2CutReason = (typeof Q2_CUT_REASONS)[number];

/** Datos crudos de la pregunta 3: `evaluate` calcula el desvío. */
export type ReferenceInput = {
  referenceUsd: number;
  poolUsd: number;
  multiplierNote?: "none" | "multiplier" | "total-return";
};

/** Datos crudos de la pregunta 4. */
export type RegimeInput = {
  marketStatus: "open" | "closed";
  nextOpenAt?: string;
  poolsAgree?: boolean;
  bookFrozen?: boolean;
  suggestSplit?: boolean;
};

export type EvaluateInput = {
  ticker: string;
  amountUsd: number;
  /**
   * Contrato puntual a revisar (el que pegó el usuario, o el de una ruta externa).
   * Si está, la pregunta 1 se corre sobre él antes de mirar cotizaciones.
   */
  target?: { address: string; check: Q1Result | "unavailable" };
  /** Una cotización por wrapper. Cada una trae el resultado de la pregunta 1 sobre su contrato. */
  quotes: Quote[] | "unavailable";
  reference?: ReferenceInput | "unavailable";
  regime?: RegimeInput | "unavailable";
  exit?: ExitBlock | "unavailable";
  constraints?: Constraints;
};

export type Evaluation =
  | { kind: "invalid" }
  | { kind: "unavailable"; question: QuestionId; reason: string }
  | { kind: "cut"; question: 1; reason: Q1CutReason; address?: string; quotes?: Quote[] }
  | { kind: "cut"; question: 2; reason: Q2CutReason; quotes: Quote[] }
  | { kind: "cut"; question: 3; reason: string; reference: Reference }
  | { kind: "cut"; question: 4; reason: string; regime: Regime }
  | {
      kind: "pass";
      wrapper: WrapperId;
      /** Contrato de la ruta ganadora: la firma ejecuta exactamente esa ruta. */
      address: string;
      impactRatio: number;
      simulatedCostUsd: number;
      tied: boolean;
      quotes: Quote[];
      reference: Reference;
      regime: Regime;
      exit: ExitBlock;
      /** Solo si la frase trajo topes: cuáles no se cumplieron. La decisión de firmar es del agente. */
      constraints?: { violated: ConstraintCode[] };
    };

const EMPTY_REFERENCE: Reference = {
  referenceUsd: "unavailable",
  poolUsd: "unavailable",
  deviationRatio: "unavailable",
  multiplierNote: "unavailable",
};

const EMPTY_REGIME: Regime = {
  marketStatus: "unavailable",
  nextOpenAt: "unavailable",
  poolsAgree: "unavailable",
  bookFrozen: "unavailable",
  suggestSplit: false,
};

const EMPTY_EXIT: ExitBlock = {
  now: "unavailable",
  availability: "unavailable",
  risk: "unavailable",
};

/**
 * Las cuatro preguntas, en orden. No llama a la red: quien consulta las APIs arma la entrada.
 * Si una falla, no hay transacción. Las preguntas 3 y 4 todavía no tienen reglas de corte:
 * sus datos entran al resultado o quedan «sin dato» hasta que sus specs las definan.
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

  if (input.target !== undefined) {
    const check = input.target.check;
    if (check === "unavailable") {
      return { kind: "unavailable", question: 1, reason: "LIST_UNAVAILABLE" };
    }
    if (!check.ok) {
      if (isUnavailableReason(check.reason)) {
        return { kind: "unavailable", question: 1, reason: check.reason };
      }
      return { kind: "cut", question: 1, reason: check.reason, address: input.target.address };
    }
  }

  const quotes = normalizeQuotes(input.quotes);
  if (quotes === null) {
    return { kind: "unavailable", question: 2, reason: "QUOTES_UNAVAILABLE" };
  }

  const eligible = quotes.filter((quote) => quote.authenticity.ok);
  if (eligible.length === 0) {
    // Si alguna pregunta 1 quedó sin verificar, es «no se pudo evaluar» (fail closed), no impostor.
    const unverified = quotes.find(
      (quote) => !quote.authenticity.ok && isUnavailableReason(quote.authenticity.reason),
    );
    if (unverified && !unverified.authenticity.ok) {
      return { kind: "unavailable", question: 1, reason: unverified.authenticity.reason };
    }
    // Todas fallaron con motivo de corte: el motivo es el del que hubiera ganado por impacto.
    const cheapest = [...quotes].sort((a, b) => a.impactRatio - b.impactRatio)[0];
    const reason: Q1CutReason =
      !cheapest.authenticity.ok && !isUnavailableReason(cheapest.authenticity.reason)
        ? cheapest.authenticity.reason
        : "CONTRACT_NOT_LISTED";
    return { kind: "cut", question: 1, reason, quotes };
  }

  const fitting = eligible.filter((quote) => quote.impactRatio <= IMPACT_LIMIT);
  if (fitting.length === 0) {
    return { kind: "cut", question: 2, reason: "IMPACT_OVER_LIMIT", quotes };
  }

  const bestImpact = Math.min(...fitting.map((quote) => quote.impactRatio));
  const atBest = fitting.filter((quote) => quote.impactRatio === bestImpact);
  const winner = WRAPPERS.map((wrapper) =>
    atBest.find((quote) => quote.wrapper === wrapper),
  ).find((quote): quote is Quote => quote !== undefined);

  if (winner === undefined) {
    return { kind: "unavailable", question: 2, reason: "QUOTES_UNAVAILABLE" };
  }

  const reference = buildReference(input.reference);
  const regime = buildRegime(input.regime);
  const exit = input.exit === undefined || input.exit === "unavailable" ? EMPTY_EXIT : input.exit;
  const constraints = checkConstraints(input.constraints, winner, reference);

  return {
    kind: "pass",
    wrapper: winner.wrapper,
    address: winner.address,
    impactRatio: winner.impactRatio,
    simulatedCostUsd: winner.simulatedCostUsd,
    tied: atBest.length > 1,
    quotes,
    reference,
    regime,
    exit,
    ...(constraints === undefined ? {} : { constraints }),
  };
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
      typeof quote.address !== "string" ||
      quote.address.length === 0 ||
      (quote.side !== "buy" && quote.side !== "sell") ||
      !Number.isFinite(quote.impactRatio) ||
      !Number.isFinite(quote.simulatedCostUsd) ||
      typeof quote.authenticity?.ok !== "boolean"
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

function buildReference(input: ReferenceInput | "unavailable" | undefined): Reference {
  if (input === undefined || input === "unavailable") {
    return EMPTY_REFERENCE;
  }
  const { referenceUsd, poolUsd } = input;
  if (
    !Number.isFinite(referenceUsd) ||
    !Number.isFinite(poolUsd) ||
    referenceUsd <= 0 ||
    poolUsd <= 0
  ) {
    return EMPTY_REFERENCE;
  }
  return {
    referenceUsd,
    poolUsd,
    deviationRatio: Math.abs(poolUsd - referenceUsd) / referenceUsd,
    multiplierNote: input.multiplierNote ?? "unavailable",
  };
}

function buildRegime(input: RegimeInput | "unavailable" | undefined): Regime {
  if (input === undefined || input === "unavailable") {
    return EMPTY_REGIME;
  }
  return {
    marketStatus: input.marketStatus,
    nextOpenAt: input.nextOpenAt ?? "unavailable",
    poolsAgree: input.poolsAgree ?? "unavailable",
    bookFrozen: input.bookFrozen ?? "unavailable",
    suggestSplit: input.suggestSplit ?? false,
  };
}

function checkConstraints(
  constraints: Constraints | undefined,
  winner: Quote,
  reference: Reference,
): { violated: ConstraintCode[] } | undefined {
  if (constraints === undefined) {
    return undefined;
  }
  const violated: ConstraintCode[] = [];
  if (
    constraints.maxImpactRatio !== undefined &&
    winner.impactRatio > constraints.maxImpactRatio
  ) {
    violated.push("MAX_IMPACT_RATIO");
  }
  if (
    constraints.maxDeviationRatio !== undefined &&
    typeof reference.deviationRatio === "number" &&
    reference.deviationRatio > constraints.maxDeviationRatio
  ) {
    violated.push("MAX_DEVIATION_RATIO");
  }
  return { violated };
}
