import {
  getAggregatedQuote,
  USDT_BSC,
  USDT_BSC_DECIMALS,
  type TradingDeps,
} from "@/lib/binance/trading";
import type { ExitBlock, WrapperId } from "@/lib/evaluate";

/**
 * Exit Now: la capa `now` del bloque de salida (`Diferenciador.md`). Vale para este
 * instante — no proyecta el precio de mañana — y `costRatio` es comparable con
 * `IMPACT_LIMIT` de `lib/thresholds.ts`, igual que la entrada.
 */
export type ExitNowQuote = Exclude<ExitBlock["now"], "unavailable">;

export type ExitNowArgs = {
  /** Contrato del token que se vende: el `toTokenAddress` de la cotización de compra. */
  tokenAddress: string;
  /**
   * Monto a vender en unidades mínimas del token: el mismo que la compra devolvió
   * (su `toTokenAmount` viaja tal cual). La función no estima ni inventa montos.
   */
  amount: string;
  wrapper: WrapperId;
  /** Address EVM en BSC de la wallet que ejecutaría el swap: los venues RFQ la exigen. */
  walletAddress?: string;
  binanceChainId?: string;
};

export type ExitNowDeps = TradingDeps & {
  /** Para tests: la cotización real es `getAggregatedQuote`. */
  quote?: typeof getAggregatedQuote;
};

/**
 * Cotiza vender el mismo monto ahora: la misma ruta de la compra al revés
 * (`token → USDT`, `side: "sell"`, mismo wrapper). Devuelve cuánto USDT se
 * recuperaría (`recoveredUsd`), el costo como fracción (`costRatio`, magnitud
 * comparable con `IMPACT_LIMIT`) y el instante de la simulación (`simulatedAt`,
 * ISO 8601 UTC). Si la cotización no llega devuelve `"unavailable"`: no hay número
 * inventado. No firma la operación ni decide el ganador entre wrappers.
 */
export async function quoteExitNow(
  args: ExitNowArgs,
  deps: ExitNowDeps,
): Promise<ExitBlock["now"]> {
  const quote = await (deps.quote ?? getAggregatedQuote)(
    {
      fromTokenAddress: args.tokenAddress,
      toTokenAddress: USDT_BSC,
      amount: args.amount,
      walletAddress: args.walletAddress,
      binanceChainId: args.binanceChainId,
      purpose: "exit-now",
      side: "sell",
      wrapper: args.wrapper,
    },
    deps,
  );
  if (quote === "unavailable") return "unavailable";

  return {
    recoveredUsd: quote.toAmount / 10 ** USDT_BSC_DECIMALS,
    costRatio: Math.abs(quote.impactRatio),
    simulatedAt: new Date().toISOString(),
  };
}
