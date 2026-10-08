import path from "node:path";
import { DEFAULT_TICKERS } from "@/lib/medicion/pools";

/** Opciones de `npm run medir:pools` (`specs/medicion-pools.md`). */

export const CALLER = "medicion";
export const PURPOSE = "medicion-pools";
const DEFAULT_DURATION = "72h";
const UNIT_MS: Record<string, number> = { m: 60_000, h: 3_600_000, d: 86_400_000 };

export type MedicionConfig = {
  durationMs: number;
  tickers: string[];
  /** Carpeta de los `pools-AAAA-MM-DD.jsonl`. */
  dataDir: string;
  /** Carpeta del registro de llamadas (`STOCKPROOF_LOG_DIR`). */
  logDir: string;
  /** Ruta de `--env`, si vino. */
  envFile: string | null;
};

/** `10m`, `2h`, `3d` a milisegundos. Lanza si no se entiende. */
export function parseDuration(text: string): number {
  const match = /^(\d+)([mhd])$/.exec(text.trim());
  if (!match || Number(match[1]) === 0) throw new Error(`--duracion inválida: «${text}» (usá 10m, 2h o 3d)`);
  return Number(match[1]) * UNIT_MS[match[2]];
}

/**
 * Lee `--duracion`, `--tickers` y `--env` de `argv` y las carpetas del entorno. Lanza si falta una
 * carpeta o si cae dentro del repo: los datos y el registro de la medición no se commitean.
 */
export function resolveConfig(
  argv: string[],
  env: Record<string, string | undefined>,
  repoRoot: string,
): MedicionConfig {
  const options = parseArgs(argv);
  const dataDir = requiredDir(env.STOCKPROOF_MEDICION_DIR, "STOCKPROOF_MEDICION_DIR", repoRoot);
  const logDir = requiredDir(env.STOCKPROOF_LOG_DIR, "STOCKPROOF_LOG_DIR", repoRoot);
  const tickers = (options.tickers ?? DEFAULT_TICKERS.join(","))
    .split(",")
    .map((ticker) => ticker.trim().toUpperCase())
    .filter(Boolean);
  if (tickers.length === 0) throw new Error("--tickers vacío");
  return {
    durationMs: parseDuration(options.duracion ?? DEFAULT_DURATION),
    tickers,
    dataDir,
    logDir,
    envFile: options.env ?? null,
  };
}

/** Solo `--env` del `argv`, para cargarlo antes de leer el resto del entorno. */
export function envFileArg(argv: string[]): string | null {
  return parseArgs(argv).env ?? null;
}

/** `pools-AAAA-MM-DD.jsonl` con la fecha UTC. */
export function dataFileName(at: Date): string {
  return `pools-${at.toISOString().slice(0, 10)}.jsonl`;
}

function parseArgs(argv: string[]): Partial<Record<"duracion" | "tickers" | "env", string>> {
  const options: Partial<Record<"duracion" | "tickers" | "env", string>> = {};
  for (let index = 0; index < argv.length; index++) {
    const name = argv[index].replace(/^--/, "");
    if (name !== "duracion" && name !== "tickers" && name !== "env") {
      throw new Error(`opción desconocida: ${argv[index]}`);
    }
    const value = argv[index + 1];
    if (value === undefined || value.startsWith("--")) throw new Error(`falta el valor de --${name}`);
    options[name] = value;
    index++;
  }
  return options;
}

function requiredDir(value: string | undefined, name: string, repoRoot: string): string {
  if (!value?.trim()) throw new Error(`falta ${name}: la medición no escribe sin carpeta propia`);
  const dir = path.resolve(value.trim());
  const relative = path.relative(path.resolve(repoRoot), dir);
  if (relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative))) {
    throw new Error(`${name} cae dentro del repo (${dir}): tiene que quedar afuera`);
  }
  return dir;
}
