import { checkConstraints } from "@/lib/questions/constraints";
import { checkTarget, decideQuestion1 } from "@/lib/questions/q1-gate";
import type { Q1CutReason, Q1Result } from "@/lib/questions/q1-reasons";
import { decideQuestion2 } from "@/lib/questions/q2";
import type { Q2CutReason } from "@/lib/questions/q2-reasons";
import { buildReference, decideQuestion3, type Q3Input } from "@/lib/questions/q3";
import type { Q3CutReason } from "@/lib/questions/q3-reasons";
import { decideQuestion4, type Q4Input } from "@/lib/questions/q4";
import type { Q4CutReason, Q4Result } from "@/lib/questions/q4-reasons";

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

/**
 * Un wrapper que no aportó cotización al conjunto. Diagnóstico: informa qué venue faltó
 * y por qué; no cambia la elegibilidad ni el ganador.
 */
export type QuoteGap = {
  wrapper: WrapperId;
  /**
   * `NOT_LISTED`: el emisor no tiene contrato en BSC para ese ticker (no se cotizó).
   * `NO_QUOTE`: el venue respondió error, sin `data` o con formato raro.
   */
  reason: "NOT_LISTED" | "NO_QUOTE";
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
        /** Comparable con `IMPACT_LIMIT` (`lib/thresholds.ts`): si lo supera, el agente puede negarse igual que en la entrada. */
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

/**
 * La salida traída para un wrapper que cotizó la compra. `now` es la venta del mismo
 * monto ya medida (compuerta, a la par de la compra); `availability` son las reglas
 * publicadas de salida (informa, no decide). Un campo que no llegó es `"unavailable"`.
 */
export type WrapperExit = {
  wrapper: WrapperId;
  now: ExitBlock["now"];
  availability: ExitBlock["availability"];
};

/** Datos crudos de la pregunta 4: misma forma que `Q4Input` (decide `decideQuestion4`). */
export type RegimeInput = Q4Input;

export type EvaluateInput = {
  ticker: string;
  amountUsd: number;
  /**
   * Contrato puntual a revisar (el que pegó el usuario, o el de una ruta externa).
   * Si está, la pregunta 1 se corre sobre él antes de mirar cotizaciones.
   */
  target?: { address: string; check: Q1Result | "unavailable" };
  /**
   * Las cotizaciones de compra que llegaron, una por wrapper cotizado (el conjunto
   * puede ser parcial). `"unavailable"` si no llegó ninguna. Cada una trae la
   * pregunta 1 sobre su contrato.
   */
  quotes: Quote[] | "unavailable";
  /** Wrappers que no aportaron cotización y por qué. Diagnóstico aditivo: no decide. */
  quoteGaps?: QuoteGap[];
  /**
   * Precios crudos de la pregunta 3, uno por wrapper cotizado (el token y el subyacente
   * se miran por separado). `evaluate` los evalúa con `decideQuestion3` sobre el ganador.
   */
  reference?: Q3Input[] | "unavailable";
  /** Datos crudos de la pregunta 4. `evaluate` los evalúa con `decideQuestion4`. */
  regime?: RegimeInput | "unavailable";
  /**
   * Salida por wrapper cotizado: la venta del mismo monto ya cotizada (`now`) y las
   * reglas publicadas (`availability`). La venta es compuerta: si no se midió para el
   * candidato, ese wrapper no se puede firmar. `risk` no se trae todavía (issue #19).
   */
  exits?: WrapperExit[];
  constraints?: Constraints;
};

export type Evaluation =
  | { kind: "invalid" }
  | {
      kind: "unavailable";
      question: QuestionId;
      reason: string;
      quoteGaps?: QuoteGap[];
      /** Cotizaciones que sí llegaron, cuando el freno es posterior a la cotización. */
      quotes?: Quote[];
      /** Salidas por wrapper cotizado: `"unavailable"` marca la venta que no se midió. */
      exits?: WrapperExit[];
      /** Datos de la pregunta 3 que sí llegaron (p.ej. falta el precio de referencia). */
      reference?: Reference;
    }
  | {
      kind: "cut";
      question: 1;
      reason: Q1CutReason;
      address?: string;
      quotes?: Quote[];
      quoteGaps?: QuoteGap[];
    }
  | {
      kind: "cut";
      question: 2;
      reason: Q2CutReason;
      quotes: Quote[];
      quoteGaps?: QuoteGap[];
      /** Salida por wrapper: en `EXIT_OVER_LIMIT` muestra el `costRatio` medido. */
      exits?: WrapperExit[];
    }
  | {
      kind: "cut";
      question: 3;
      reason: Q3CutReason;
      reference: Reference;
      /** El candidato que ganó la compra y la venta, y falló acá. */
      wrapper?: WrapperId;
      address?: string;
      quotes?: Quote[];
      exits?: WrapperExit[];
      quoteGaps?: QuoteGap[];
    }
  | {
      kind: "cut";
      question: 4;
      reason: Q4CutReason;
      regime: Regime;
      /** El candidato que ganó la compra y la venta, y falló acá. */
      wrapper?: WrapperId;
      address?: string;
      quotes?: Quote[];
      exits?: WrapperExit[];
      quoteGaps?: QuoteGap[];
    }
  | {
      kind: "pass";
      wrapper: WrapperId;
      /** Contrato de la ruta ganadora: la firma ejecuta exactamente esa ruta. */
      address: string;
      impactRatio: number;
      simulatedCostUsd: number;
      tied: boolean;
      quotes: Quote[];
      /** Wrappers que no cotizaron (conjunto parcial). Diagnóstico, no decide. */
      quoteGaps?: QuoteGap[];
      /** Salida de cada wrapper cotizado: la del ganador además está en `exit.now`. */
      exits?: WrapperExit[];
      reference: Reference;
      regime: Regime;
      exit: ExitBlock;
      /** Solo si la frase trajo topes: cuáles no se cumplieron. La decisión de firmar es del agente. */
      constraints?: { violated: ConstraintCode[] };
    };

const EMPTY_REGIME: Regime = {
  marketStatus: "unavailable",
  nextOpenAt: "unavailable",
  poolsAgree: "unavailable",
  bookFrozen: "unavailable",
  suggestSplit: false,
};

/**
 * Las cuatro preguntas, en orden (regla del vault, 30 sep 2026). No llama a la red:
 * quien consulta las APIs arma la entrada. Si una falla, no hay transacción.
 *
 * Solo orquesta: cada pregunta decide en su archivo de `lib/questions/` y los umbrales
 * viven en `lib/thresholds.ts`. Acá se valida la entrada, se llama a cada pregunta en
 * orden y se arma el resultado. Las preguntas 3 y 4 corren sobre el ganador de la 2;
 * la disponibilidad de salida informa y nunca elimina.
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

  // Diagnóstico del conjunto parcial: viaja a todo resultado que expone cotizaciones.
  const gaps = input.quoteGaps === undefined ? {} : { quoteGaps: input.quoteGaps };
  const exitByWrapper = normalizeExits(input.exits);
  const exits =
    exitByWrapper.size === 0
      ? {}
      : {
          exits: WRAPPERS.flatMap((wrapper) => {
            const exit = exitByWrapper.get(wrapper);
            return exit === undefined ? [] : [exit];
          }),
        };

  if (input.target !== undefined) {
    const target = checkTarget(input.target.check);
    if (target.kind === "unavailable") {
      return { kind: "unavailable", question: 1, reason: target.reason, ...gaps };
    }
    if (target.kind === "cut") {
      return {
        kind: "cut",
        question: 1,
        reason: target.reason,
        address: input.target.address,
        ...gaps,
      };
    }
  }

  const quotes = normalizeQuotes(input.quotes);
  if (quotes === null) {
    return { kind: "unavailable", question: 2, reason: "QUOTES_UNAVAILABLE", ...gaps };
  }

  const q1 = decideQuestion1(quotes);
  if (q1.kind === "unavailable") {
    return { kind: "unavailable", question: 1, reason: q1.reason, ...gaps };
  }
  if (q1.kind === "cut") {
    return { kind: "cut", question: 1, reason: q1.reason, quotes, ...gaps };
  }

  const q2 = decideQuestion2(q1.eligible, exitByWrapper);
  if (q2.kind === "cut") {
    return { kind: "cut", question: 2, reason: q2.reason, quotes, ...exits, ...gaps };
  }
  if (q2.kind === "unavailable") {
    // Sin ganador no hay nada medido que mostrar; la venta sin medir sí muestra lo cotizado.
    return q2.reason === "QUOTES_UNAVAILABLE"
      ? { kind: "unavailable", question: 2, reason: q2.reason, ...gaps }
      : { kind: "unavailable", question: 2, reason: q2.reason, quotes, ...exits, ...gaps };
  }
  const { winner, tied } = q2;

  // Pregunta 3 sobre el candidato: explica el desvío (multiplier o retorno total) o
  // corta. Un precio que no llegó es «no se pudo evaluar»: fail closed, no se firma.
  const q3Input =
    input.reference === undefined || input.reference === "unavailable"
      ? undefined
      : input.reference.find((entry) => entry.wrapper === winner.wrapper);
  const q3 = decideQuestion3(
    q3Input ?? {
      wrapper: winner.wrapper,
      tokenPriceUsd: "unavailable",
      referenceUsd: "unavailable",
    },
  );
  const reference = buildReference(q3Input, q3);
  if (q3.kind === "cut") {
    return {
      kind: "cut",
      question: 3,
      reason: q3.reason,
      reference,
      wrapper: winner.wrapper,
      address: winner.address,
      quotes,
      ...exits,
      ...gaps,
    };
  }
  if (q3.kind === "unavailable") {
    return {
      kind: "unavailable",
      question: 3,
      reason: q3.reason,
      reference,
      quotes,
      ...exits,
      ...gaps,
    };
  }

  // Pregunta 4: el único corte es pools que no coinciden. Mercado cerrado no corta y
  // el libro clavado queda en `regime` para que el comprobante lo diga.
  const q4: Q4Result =
    input.regime === undefined || input.regime === "unavailable"
      ? { ok: true, regime: EMPTY_REGIME }
      : decideQuestion4(input.regime);
  const regime = q4.regime;
  if (!q4.ok) {
    return {
      kind: "cut",
      question: 4,
      reason: q4.reason,
      regime,
      wrapper: winner.wrapper,
      address: winner.address,
      quotes,
      ...exits,
      ...gaps,
    };
  }

  const winnerExit = exitByWrapper.get(winner.wrapper);
  const exit: ExitBlock = {
    // `now` del ganador llegó medido (la compuerta lo exigió); las otras capas informan.
    now: winnerExit?.now ?? "unavailable",
    availability: winnerExit?.availability ?? "unavailable",
    risk: "unavailable",
  };
  const constraints = checkConstraints(input.constraints, winner, reference);

  return {
    kind: "pass",
    wrapper: winner.wrapper,
    address: winner.address,
    impactRatio: winner.impactRatio,
    simulatedCostUsd: winner.simulatedCostUsd,
    tied,
    quotes,
    ...exits,
    reference,
    regime,
    exit,
    ...gaps,
    ...(constraints === undefined ? {} : { constraints }),
  };
}

/**
 * Devuelve las cotizaciones válidas en orden estable (`WRAPPERS`), o null si el conjunto
 * no sirve: cero válidas, duplicadas o con campos malformados. Basta una válida.
 */
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
      !WRAPPERS.includes(quote.wrapper) ||
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

  if (byWrapper.size === 0) {
    return null;
  }

  const ordered: Quote[] = [];
  for (const wrapper of WRAPPERS) {
    const quote = byWrapper.get(wrapper);
    if (quote !== undefined) {
      ordered.push(quote);
    }
  }
  return ordered;
}

/**
 * Salidas por wrapper en un mapa validado para la compuerta: un wrapper desconocido o
 * repetido se ignora, y un `now` malformado cuenta como `"unavailable"` (no se midió).
 */
function normalizeExits(exits: WrapperExit[] | undefined): Map<WrapperId, WrapperExit> {
  const byWrapper = new Map<WrapperId, WrapperExit>();
  if (exits === undefined) {
    return byWrapper;
  }
  for (const exit of exits) {
    if (!WRAPPERS.includes(exit.wrapper) || byWrapper.has(exit.wrapper)) {
      continue;
    }
    byWrapper.set(exit.wrapper, {
      wrapper: exit.wrapper,
      now: usableExitNow(exit.now),
      availability:
        typeof exit.availability === "object" && exit.availability !== null
          ? exit.availability
          : "unavailable",
    });
  }
  return byWrapper;
}

function usableExitNow(now: WrapperExit["now"]): WrapperExit["now"] {
  if (typeof now !== "object" || now === null) {
    return "unavailable";
  }
  if (
    !Number.isFinite(now.recoveredUsd) ||
    !Number.isFinite(now.costRatio) ||
    typeof now.simulatedAt !== "string"
  ) {
    return "unavailable";
  }
  return now;
}
