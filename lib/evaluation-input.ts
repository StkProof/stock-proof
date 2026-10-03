import {
  getMarketStatus,
  getTokenDynamic,
  listStockTokens,
  publicQ1Sources,
  type PublicDeps,
  type PublicToken,
} from "@/lib/binance/rwa-public";
import { binanceWeb3Signer, WEB3_BASE_URL } from "@/lib/binance/sign";
import {
  getAggregatedQuote,
  toMinimalUnits,
  USDT_BSC,
  USDT_BSC_DECIMALS,
} from "@/lib/binance/trading";
import type { SignRequest } from "@/lib/binance/rwa";
import {
  WRAPPERS,
  type EvaluateInput,
  type ExitBlock,
  type Quote,
  type QuoteGap,
  type RegimeInput,
  type WrapperExit,
  type WrapperId,
} from "@/lib/evaluate";
import {
  buildExitAvailability,
  type ExitAvailabilitySources,
} from "@/lib/questions/exit-availability";
import { quoteExitNow, type ExitNowArgs } from "@/lib/questions/exit-now";
import { checkContractSources, signedQ1Sources, type Q1Sources } from "@/lib/questions/q1";
import type { Q1Result } from "@/lib/questions/q1-reasons";
import type { Q3Input } from "@/lib/questions/q3";
import type { CallContext } from "@/lib/binance/call-log";

export type EvaluateRequest = {
  ticker: string;
  amountUsd: number;
  /** Contrato puntual a revisar (el que pegó el usuario). Si está, la pregunta 1 decide sobre él. */
  address?: string;
  /**
   * Tope de impacto que sale de la frase, en fracción (`0.01` = 1 %).
   * Se reenvía a `evaluate`. No reemplaza el 1 % de la pregunta 2.
   */
  maxImpactRatio?: number;
};

/**
 * Lo que el orquestador necesita traer. Todas las fuentes ya están adaptadas; con `sign: null`
 * trabaja en modo público (pregunta 1 real, cotizaciones «sin dato»).
 */
export type InputDeps = {
  sign: SignRequest | null;
  /**
   * Address EVM en BSC del agente: viaja como `userWalletAddress` en las cotizaciones.
   * Sin ella los venues RFQ responden error y quedan `NO_QUOTE`.
   */
  walletAddress?: string;
  rpcUrl?: string;
  context?: CallContext;
  /** Para tests: sobreescribe las fuentes una a una. */
  overrides?: Partial<InputSources>;
};

export type InputSources = {
  listTokens(): Promise<PublicToken[] | "unavailable">;
  q1: Q1Sources;
  /**
   * Cotiza la compra. `toTokenAmount` es el monto de salida tal cual vino de la API
   * (unidades mínimas, cadena): es el `amount` exacto que la venta inversa cotiza.
   */
  quote(
    from: string,
    to: string,
    amount: string,
    wrapper: WrapperId,
  ): Promise<{ impactRatio: number; toAmount: number; toTokenAmount: string } | "unavailable">;
  dynamic(address: string): ReturnType<typeof getTokenDynamic>;
  marketStatus(): ReturnType<typeof getMarketStatus>;
  /** Venta del mismo monto ahora (Exit Now): la compuerta de salida. */
  exitNow(args: ExitNowArgs): Promise<ExitBlock["now"]>;
  /** Reglas publicadas de salida del wrapper: informan, no deciden. */
  exitAvailability(wrapper: WrapperId): Promise<ExitBlock["availability"]>;
};

/** Deps reales del servidor: firmadas si hay credenciales, públicas siempre. */
export function realInputDeps(env: NodeJS.ProcessEnv = process.env): InputDeps {
  const sign = binanceWeb3Signer(env);
  return {
    sign,
    walletAddress: env.AGENT_WALLET_ADDRESS?.trim() || undefined,
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
  const { quotes, gaps, exits, reference } = await buildQuotes(
    req.amountUsd,
    byWrapper,
    sources,
    deps,
  );
  const regime = await buildRegime(sources);

  return {
    ticker,
    amountUsd: req.amountUsd,
    ...(target === undefined ? {} : { target }),
    quotes: quotes.length === 0 ? "unavailable" : quotes,
    ...(gaps.length === 0 ? {} : { quoteGaps: gaps }),
    reference: reference.length === 0 ? "unavailable" : reference,
    regime,
    ...(exits.length === 0 ? {} : { exits }),
    ...constraintsField(req.maxImpactRatio),
  };
}

function constraintsField(
  maxImpactRatio: number | undefined,
): { constraints: { maxImpactRatio: number } } | Record<string, never> {
  if (maxImpactRatio === undefined || !Number.isFinite(maxImpactRatio) || maxImpactRatio <= 0) {
    return {};
  }
  return { constraints: { maxImpactRatio } };
}

function resolveSources(deps: InputDeps): InputSources {
  const publicDeps: PublicDeps = { context: deps.context };
  const q1: Q1Sources =
    deps.sign === null
      ? publicQ1Sources({ context: deps.context, rpcUrl: deps.rpcUrl })
      : signedQ1Sources({ rwa: { sign: deps.sign, context: deps.context }, rpcUrl: deps.rpcUrl });
  const sign = deps.sign;

  const defaults: InputSources = {
    listTokens: () => listStockTokens(publicDeps),
    q1,
    quote: (from, to, amount, wrapper) =>
      sign === null
        ? Promise.resolve("unavailable")
        : getAggregatedQuote(
            {
              fromTokenAddress: from,
              toTokenAddress: to,
              amount,
              walletAddress: deps.walletAddress,
              purpose: "q2",
              side: "buy",
              wrapper,
            },
            { sign, baseUrl: WEB3_BASE_URL, context: deps.context },
          ),
    dynamic: (address) => getTokenDynamic(address, publicDeps),
    marketStatus: () => getMarketStatus(publicDeps),
    exitNow: (args) =>
      sign === null
        ? Promise.resolve("unavailable")
        : quoteExitNow(args, { sign, baseUrl: WEB3_BASE_URL, context: deps.context }),
    exitAvailability: (wrapper) =>
      buildExitAvailability(wrapper, {
        marketStatus: () => sources.marketStatus(),
      } satisfies ExitAvailabilitySources),
  };
  const sources: InputSources = { ...defaults, ...deps.overrides };

  // El estado de mercado es el mismo endpoint para la pregunta 4 y para la
  // disponibilidad de salida de cada wrapper: una sola lectura por evaluación.
  const marketStatusSource = sources.marketStatus;
  let statusPromise: ReturnType<InputSources["marketStatus"]> | undefined;
  sources.marketStatus = () => (statusPromise ??= marketStatusSource());
  return sources;
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
 * Cotiza la compra de cada wrapper con contrato listado, en unidades mínimas de USDT
 * y con la wallet del agente. Conjunto parcial con motivo: sin contrato queda `NOT_LISTED`
 * (ni se intenta), sin quote usable queda `NO_QUOTE`; la pregunta 1 solo corre sobre los
 * contratos que sí cotizaron (sin ruta no hay nada que evaluar). Sin `sign` no hay llamada
 * firmada posible: el conjunto queda vacío.
 *
 * Por cada compra que llegó se traen además, sin decidir nada:
 * - la venta del mismo monto (`exitNow`, con el `toTokenAmount` real de la compra);
 * - las reglas publicadas de salida (`exitAvailability`, informa);
 * - los precios crudos de la pregunta 3 (`reference`, el token y el subyacente).
 */
async function buildQuotes(
  amountUsd: number,
  byWrapper: Map<WrapperId, PublicToken>,
  sources: InputSources,
  deps: InputDeps,
): Promise<{
  quotes: Quote[];
  gaps: QuoteGap[];
  exits: WrapperExit[];
  reference: Q3Input[];
}> {
  if (deps.sign === null) return { quotes: [], gaps: [], exits: [], reference: [] };
  const amount = toMinimalUnits(amountUsd, USDT_BSC_DECIMALS);

  const perWrapper = await Promise.all(
    WRAPPERS.map(
      async (
        wrapper,
      ): Promise<
        { quote: Quote; exit: WrapperExit; reference: Q3Input } | { gap: QuoteGap }
      > => {
        const token = byWrapper.get(wrapper);
        if (token === undefined) return { gap: { wrapper, reason: "NOT_LISTED" } };
        const quote = await sources.quote(
          USDT_BSC,
          token.contractAddress,
          amount,
          wrapper,
        );
        if (quote === "unavailable") {
          return { gap: { wrapper, reason: "NO_QUOTE" } };
        }

        const [authenticity, now, availability, dynamic] = await Promise.all([
          checkContractSources(
            { ticker: token.ticker, wrapper, address: token.contractAddress },
            sources.q1,
          ).catch((): Q1Result => ({ ok: false, reason: "LIST_UNAVAILABLE" })),
          sources
            .exitNow({
              tokenAddress: token.contractAddress,
              amount: quote.toTokenAmount,
              wrapper,
              walletAddress: deps.walletAddress,
            })
            .catch((): "unavailable" => "unavailable"),
          sources.exitAvailability(wrapper).catch((): "unavailable" => "unavailable"),
          sources.dynamic(token.contractAddress).catch((): "unavailable" => "unavailable"),
        ]);

        return {
          quote: {
            wrapper,
            address: token.contractAddress,
            side: "buy",
            impactRatio: quote.impactRatio,
            simulatedCostUsd: amountUsd * (1 + quote.impactRatio),
            authenticity,
          },
          exit: { wrapper, now, availability },
          reference:
            dynamic === "unavailable"
              ? { wrapper, tokenPriceUsd: "unavailable", referenceUsd: "unavailable" }
              : {
                  wrapper,
                  tokenPriceUsd: dynamic.tokenPriceUsd,
                  referenceUsd: dynamic.stockPriceUsd,
                  sharesMultiplier: dynamic.sharesMultiplier,
                },
        };
      },
    ),
  );

  return {
    quotes: perWrapper.flatMap((item) => ("quote" in item ? [item.quote] : [])),
    gaps: perWrapper.flatMap((item) => ("gap" in item ? [item.gap] : [])),
    exits: perWrapper.flatMap((item) => ("exit" in item ? [item.exit] : [])),
    reference: perWrapper.flatMap((item) => ("reference" in item ? [item.reference] : [])),
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
