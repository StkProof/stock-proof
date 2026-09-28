import { randomUUID } from "node:crypto";
import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";
import type { WrapperId } from "@/lib/evaluate";

/** Límite del cuerpo guardado por línea: 20 KB en UTF-8. */
export const RESPONSE_LIMIT_BYTES = 20 * 1024;

export const HIDDEN = "[oculto]";

const UNKNOWN = "desconocido";

/**
 * Campos de `params` que nunca se anotan: el nombre termina en key, secret, sign, signature, token
 * o password, sin distinguir mayúsculas (`apiKey`, `X-OC-SIGN`, `accessToken`). Se mira el final y
 * no el texto suelto para no ocultar `keyword` ni `tokenContractAddress`, que el informe necesita.
 */
const SECRET_NAME = /(key|secret|sign|signature|token|password)$/i;

export type BinanceApi = "rwa" | "trading" | "transaction" | "market" | "wallet";

/** Para qué fue la llamada. Lo pasa quien llama; la puerta no lo inventa. */
export type CallContext = {
  ticker?: string;
  amountUsd?: number;
  side?: "buy" | "sell";
  wrapper?: WrapperId;
  /** Por ejemplo `q1`, `q2`, `exit-now`. */
  purpose?: string;
  /** Compartido por todas las llamadas de una misma evaluación. Ver `newEvaluationId`. */
  evaluationId?: string;
  /** ISO 8601 UTC del precio de referencia usado para el gap. */
  referencePriceAt?: string;
  /** Hash de la transacción en BSC, solo en llamadas que firman. */
  txHash?: string;
};

export type LoggedResponse = { body: unknown; truncated: boolean };

/** Una línea del registro. Los campos son los de la tabla de `specs/registro-llamadas.md`. */
export type CallLogEntry = {
  ts: string;
  caller: string;
  env: string;
  api: BinanceApi;
  endpoint: string;
  method: string;
  params: Record<string, unknown>;
  context: CallContext;
  /** `null` si la red falló antes de responder. */
  status: number | null;
  ok: boolean;
  durationMs: number;
  error: string | null;
  response: LoggedResponse | null;
};

/** Copia de `params` con los campos secretos reemplazados por `"[oculto]"`, también en objetos anidados. */
export function redactParams(params: Record<string, unknown>): Record<string, unknown> {
  return redactValue(params) as Record<string, unknown>;
}

function redactValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactValue);
  if (value === null || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value).map(([name, inner]) => [
      name,
      SECRET_NAME.test(name) ? HIDDEN : redactValue(inner),
    ]),
  );
}

/** Tiempo máximo esperando el cuerpo para el registro. Pasado eso, la línea queda sin cuerpo. */
export const RESPONSE_READ_TIMEOUT_MS = 5_000;

/**
 * Lee del clon como máximo 20 KB y un byte, y cancela el resto: una respuesta enorme o que no
 * termina no bloquea la puerta. Cancelar el clon no corta la respuesta original.
 */
export async function readForLog(response: Response): Promise<string> {
  const body = response.clone().body;
  if (body === null) return "";
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("el cuerpo tardó demasiado")), RESPONSE_READ_TIMEOUT_MS);
  });
  try {
    while (size <= RESPONSE_LIMIT_BYTES) {
      const { done, value } = await Promise.race([reader.read(), timeout]);
      if (done) break;
      chunks.push(value);
      size += value.byteLength;
    }
  } finally {
    clearTimeout(timer);
    reader.cancel().catch(() => {});
  }
  return Buffer.concat(chunks).subarray(0, RESPONSE_LIMIT_BYTES + 1).toString("utf8");
}

/**
 * Corta el texto a 20 KB. Si no se cortó y es JSON válido, lo devuelve como objeto, con los campos
 * secretos ocultos igual que en `params`.
 */
export function truncateResponse(text: string): LoggedResponse {
  const bytes = Buffer.from(text, "utf8");
  if (bytes.length > RESPONSE_LIMIT_BYTES) {
    // Un corte en medio de un carácter deja un «�» al final: se descarta.
    const cut = bytes.subarray(0, RESPONSE_LIMIT_BYTES).toString("utf8").replace(/�$/, "");
    return { body: cut, truncated: true };
  }
  try {
    return { body: redactValue(JSON.parse(text)), truncated: false };
  } catch {
    return { body: text, truncated: false };
  }
}

export function newEvaluationId(): string {
  return randomUUID();
}

export function resolveCaller(): string {
  return process.env.STOCKPROOF_CALLER?.trim() || UNKNOWN;
}

export function resolveEnv(): string {
  return process.env.STOCKPROOF_ENV?.trim() || UNKNOWN;
}

/** `<dir>/binance-calls-<caller>.jsonl`. El nombre solo lleva `a-z`, `0-9` y `-`, para no escribir fuera de la carpeta. */
export function logFilePath(caller: string): string {
  const dir = process.env.STOCKPROOF_LOG_DIR || path.join(process.cwd(), "logs");
  const safe = caller.toLowerCase().replace(/[^a-z0-9-]/g, "") || UNKNOWN;
  return path.join(dir, `binance-calls-${safe}.jsonl`);
}

/** Agrega una línea al archivo de quien llamó. Nunca lanza: el registro no rompe la app. */
export async function writeCallLog(entry: CallLogEntry): Promise<void> {
  const file = logFilePath(entry.caller);
  try {
    await mkdir(path.dirname(file), { recursive: true });
    await appendFile(file, JSON.stringify(entry) + "\n", "utf8");
  } catch (error) {
    console.warn(`registro de llamadas: no se pudo escribir ${file}: ${messageOf(error)}`);
  }
}

export function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
