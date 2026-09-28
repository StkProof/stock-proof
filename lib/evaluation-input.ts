import {
  getMarketStatus,
  getTokenDynamic,
  listStockTokens,
  publicQ1Sources,
  type PublicDeps,
  type PublicToken,
} from "@/lib/binance/rwa-public";
import { binanceWeb3Signer, WEB3_BASE_URL } from "@/lib/binance/sign";
import { getAggregatedQuote, USDT_BSC } from "@/lib/binance/trading";
import type { SignRequest } from "@/lib/binance/rwa";
import {
  WRAPPERS,
  type EvaluateInput,
  type Quote,
  type ReferenceInput,
  type RegimeInput,
  type WrapperId,
} from "@/lib/evaluate";
import { checkContractSources, signedQ1Sources, type Q1Sources } from "@/lib/questions/q1";
import type { Q1Result } from "@/lib/questions/q1-reasons";
import type { CallContext } from "@/lib/binance/call-log";

export type EvaluateRequest = {
  ticker: string;
  amountUsd: number;
  /** Contrato puntual a revisar (el que pegó el usuario). Si está, la pregunta 1 decide sobre él. */
  address?: string;
};

/**
 * Lo que el orquestador necesita traer. Todas las fuentes ya están adaptadas; con `sign: null`
 * trabaja en modo público (pregunta 1 real, cotizaciones «sin dato»).
 */
export type InputDeps = {
  sign: SignRequest | null;
  rpcUrl?: string;
  context?: CallContext;
  /** Para tests: sobreescribe las fuentes una a una. */
  overrides?: Partial<InputSources>;
};

export type InputSources = {
  listTokens(): Promise<PublicToken[] | "unavailable">;
  q1: Q1Sources;
  quote(
    from: string,
    to: string,
    amount: string,
    wrapper: WrapperId,
  ): Promise<{ impactRatio: number; toAmount: number } | "unavailable">;
  dynamic(address: string): ReturnType<typeof getTokenDynamic>;
  marketStatus(): ReturnType<typeof getMarketStatus>;
};

/** Deps reales del servidor: firmadas si hay credenciales, públicas siempre. */
export function realInputDeps(env: NodeJS.ProcessEnv = process.env): InputDeps {
  const sign = binanceWeb3Signer(env);
  return {
    sign,
    rpcUrl: env.BSC_RPC_URL?.trim() || "https://bsc-dataseed.bnbchain.org",
  };
}

/**
 * Arma el `EvaluateInput` desde las fuentes reales. No decide nada: traduce respuestas a tipos
 * y declara `"unavailable"` lo que no llegó. `evaluate` sigue siendo el único que corta.
 */
export async function buildEvaluateInput(
  req: EvaluateRequest,
  deps: InputDeps,
): Promise<EvaluateInput> {
  const sources = resolveSources(deps);
  const ticker = req.ticker.trim().toUpperCase();

  // Sin ticker válido, `evaluate` devuelve `invalid` sin llamar a nadie: no traemos nada.
  if (ticker.length === 0 || !Number.isFinite(req.amountUsd) || req.amountUsd <= 0) {
    return { ticker: req.ticker, amountUsd: req.amountUsd, quotes: "unavailable" };
  }

  const tokens = await sources.listTokens();
  const byWrapper = tokensOfTicker(tokens, ticker);

  const target = await buildTarget(req.address, ticker, byWrapper, sources);
  const quotes = await buildQuotes(req.amountUsd, byWrapper, sources, deps);
  const reference = await buildReference(byWrapper, sources);
  const regime = await buildRegime(sources);

  return {
    ticker,
    amountUsd: req.amountUsd,
    ...(target === undefined ? {} : { target }),
    quotes,
    reference,
    regime,
    exit: "unavailable",
  };
}

function resolveSources(deps: InputDeps): InputSources {
  const publicDeps: PublicDeps = { context: deps.context };
  const q1: Q1Sources =
    deps.sign === null
      ? publicQ1Sources({ context: deps.context, rpcUrl: deps.rpcUrl })
      : signedQ1Sources({ rwa: { sign: deps.sign, context: deps.context }, rpcUrl: deps.rpcUrl });

  const defaults: InputSources = {
    listTokens: () => listStockTokens(publicDeps),
    q1,
    quote: (from, to, amount, wrapper) =>
      deps.sign === null
        ? Promise.resolve("unavailable")
        : getAggregatedQuote(
            { fromTokenAddress: from, toTokenAddress: to, amount, purpose: "q2", side: "buy", wrapper },
            { sign: deps.sign, baseUrl: WEB3_BASE_URL, context: deps.context },
          ),
    dynamic: (address) => getTokenDynamic(address, publicDeps),
    marketStatus: () => getMarketStatus(publicDeps),
  };
  return { ...defaults, ...deps.overrides };
}

/** Un token por wrapper para el ticker, en el orden fijo. Solo BSC (`listStockTokens` ya filtra). */
function tokensOfTicker(
  tokens: PublicToken[] | "unavailable",
  ticker: string,
): Map<WrapperId, PublicToken> {
  const byWrapper = new Map<WrapperId, PublicToken>();
  if (tokens === "unavailable") return byWrapper;
  for (const token of tokens) {
    if (token.ticker.toUpperCase() !== ticker) continue;
    if (!byWrapper.has(token.wrapper)) byWrapper.set(token.wrapper, token);
  }
  return byWrapper;
}

async function buildTarget(
  address: string | undefined,
  ticker: string,
  byWrapper: Map<WrapperId, PublicToken>,
  sources: InputSources,
): Promise<EvaluateInput["target"] | undefined> {
  if (address === undefined || address.trim().length === 0) return undefined;
  const normalized = address.trim();

  // El emisor se deduce del contrato: si está en la lista, su `type` manda; si no, cualquier
  // wrapper sirve (la lista ya dice que no está y el corte llega antes del estándar).
  const listed = [...byWrapper.values()].find(
    (token) => token.contractAddress.toLowerCase() === normalized.toLowerCase(),
  );
  const wrapper = listed?.wrapper ?? "bstocks";

  const check = await checkContractSources(
    { ticker, wrapper, address: normalized },
    sources.q1,
  ).catch((): Q1Result => ({ ok: false, reason: "LIST_UNAVAILABLE" }));
  return { address: normalized, check };
}

/**
 * Una cotización por emisor con la pregunta 1 ya corrida sobre su contrato. Sin `sign` o sin
 * contrato listado, el conjunto queda `"unavailable"` (la spec pide las tres o nada).
 */
async function buildQuotes(
  amountUsd: number,
  byWrapper: Map<WrapperId, PublicToken>,
  sources: InputSources,
  deps: InputDeps,
): Promise<Quote[] | "unavailable"> {
  if (deps.sign === null) return "unavailable";
  const amount = amountUsd.toString();

  const perWrapper = await Promise.all(
    WRAPPERS.map(async (wrapper): Promise<Quote | null> => {
      const token = byWrapper.get(wrapper);
      if (token === undefined) return null;
      const [quote, authenticity] = await Promise.all([
        sources.quote(USDT_BSC, token.contractAddress, amount, wrapper),
        checkContractSources(
          { ticker: token.ticker, wrapper, address: token.contractAddress },
          sources.q1,
        ).catch((): Q1Result => ({ ok: false, reason: "LIST_UNAVAILABLE" })),
      ]);
      if (quote === "unavailable") return null;
      return {
        wrapper,
        address: token.contractAddress,
        side: "buy",
        impactRatio: quote.impactRatio,
        simulatedCostUsd: amountUsd * (1 + quote.impactRatio),
        authenticity,
      };
    }),
  );

  return perWrapper.every((quote): quote is Quote => quote !== null) ? perWrapper : "unavailable";
}

/**
 * Datos de la pregunta 3 del token de referencia (bStocks primero, como el desempate).
 * El token cotiza por acción × multiplicador; el subyacente es el precio por acción.
 * `stockPriceUsd: null` (fuera de rueda) deja el dato fuera y `evaluate` lo marca «sin dato».
 */
async function buildReference(
  byWrapper: Map<WrapperId, PublicToken>,
  sources: InputSources,
): Promise<ReferenceInput | "unavailable"> {
  const token = WRAPPERS.map((wrapper) => byWrapper.get(wrapper)).find(
    (item): item is PublicToken => item !== undefined,
  );
  if (token === undefined) return "unavailable";

  const dynamic = await sources.dynamic(token.contractAddress);
  if (dynamic === "unavailable") return "unavailable";
  if (
    dynamic.tokenPriceUsd === "unavailable" ||
    dynamic.stockPriceUsd === null ||
    dynamic.stockPriceUsd === "unavailable"
  ) {
    return "unavailable";
  }
  return {
    referenceUsd: dynamic.stockPriceUsd,
    poolUsd: dynamic.tokenPriceUsd,
    // El token cotiza acción × multiplicador: si el dato vino, se declara; si no, se omite.
    ...(dynamic.sharesMultiplier === "unavailable" ? {} : { multiplierNote: "multiplier" as const }),
  };
}

async function buildRegime(sources: InputSources): Promise<RegimeInput | "unavailable"> {
  const status = await sources.marketStatus();
  if (status === "unavailable" || status.marketStatus === "unavailable") return "unavailable";
  return {
    marketStatus: status.marketStatus,
    ...(status.nextOpenAt === "unavailable" ? {} : { nextOpenAt: status.nextOpenAt }),
  };
}
