/**
 * Medición de dispersión entre pools (`specs/medicion-pools.md`).
 *
 *   STOCKPROOF_MEDICION_DIR=~/mediciones STOCKPROOF_LOG_DIR=~/mediciones/logs \
 *     npm run medir:pools -- --duracion 72h [--tickers QQQ,SPY] [--env ruta/.env]
 *
 * Cada 5 minutos guarda los fills nuevos de cada token (paginando); cada hora, además, sus pools con el
 * precio on-chain. Termina con código 2 si Binance responde tres límites seguidos.
 */
import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { binanceWeb3Signer } from "@/lib/binance/sign";
import { getMarketStatus, listStockTokens } from "@/lib/binance/rwa-public";
import { CALLER, PURPOSE, dataFileName, envFileArg, resolveConfig } from "@/lib/medicion/config";
import { ROUND_INTERVAL_MS, measureRound, selectTokens } from "@/lib/medicion/pools";
import { RateLimitExceeded, createRateGuard } from "@/lib/medicion/rate-guard";

const DEFAULT_RPC_URL = "https://bsc-dataseed.bnbchain.org";

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

async function main(): Promise<number> {
  const argv = process.argv.slice(2).filter((arg) => arg !== "--");
  const envFile = envFileArg(argv);
  if (envFile) process.loadEnvFile(envFile);

  const config = resolveConfig(argv, process.env, process.cwd());
  process.env.STOCKPROOF_LOG_DIR = config.logDir;
  process.env.STOCKPROOF_CALLER = CALLER;

  const sign = binanceWeb3Signer();
  if (sign === null) {
    console.error("falta la key de Binance (BINANCE_API_KEY + secreto): la medición necesita la Market API");
    return 1;
  }

  const context = { purpose: PURPOSE };
  const listed = await listStockTokens({ context });
  if (listed === "unavailable") {
    console.error("no se pudo leer la lista pública de tokens");
    return 1;
  }
  const tokens = selectTokens(listed, config.tickers);
  if (tokens.length === 0) {
    console.error(`ningún token para ${config.tickers.join(", ")}`);
    return 1;
  }
  console.log(`midiendo ${tokens.length} tokens: ${tokens.map((token) => token.symbol).join(", ")}`);

  await mkdir(config.dataDir, { recursive: true });
  const guard = createRateGuard({ now: Date.now, sleep });
  const rpcUrl = process.env.BSC_RPC_URL?.trim() || DEFAULT_RPC_URL;
  const startedAt = Date.now();
  const endsAt = startedAt + config.durationMs;

  const lastSeenAt = new Map<string, number>();
  for (let round = 0; Date.now() < endsAt; round++) {
    const roundStart = new Date();
    const file = path.join(config.dataDir, dataFileName(roundStart));
    try {
      const lines = await measureRound(tokens, round, {
        guard,
        market: { sign, context },
        rpcUrl,
        now: Date.now,
        marketStatus: () => getMarketStatus({ context }),
        lastSeenAt,
      });
      await appendFile(file, lines.map((line) => JSON.stringify(line)).join("\n") + "\n", "utf8");
      const failed = lines.filter((line) => line.tradesError || line.poolsError).length;
      const truncated = lines.filter((line) => line.tradesTruncated).length;
      const pages = lines.reduce((sum, line) => sum + (line.tradePages ?? 0), 0);
      console.log(
        `${new Date().toISOString()} ronda ${round}: ${lines.length} líneas, ${pages} páginas, ${failed} con error, ${truncated} truncadas`,
      );
    } catch (error) {
      if (error instanceof RateLimitExceeded) {
        console.error(error.message);
        return 2;
      }
      const message = error instanceof Error ? error.message : String(error);
      console.error(`ronda ${round} falló: ${message}`);
      await appendFile(file, JSON.stringify({ at: roundStart.toISOString(), round, roundError: message }) + "\n", "utf8").catch(
        () => {},
      );
    }

    const nextAt = startedAt + (round + 1) * ROUND_INTERVAL_MS;
    if (nextAt >= endsAt) break;
    await sleep(Math.max(0, nextAt - Date.now()));
  }
  console.log("medición terminada");
  return 0;
}

main().then(
  (code) => process.exit(code),
  (error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  },
);
