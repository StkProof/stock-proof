import { createHmac, createPrivateKey, sign as cryptoSign } from "node:crypto";
import { readFileSync } from "node:fs";
import type { SignRequest } from "@/lib/binance/rwa";

/**
 * La autenticación de la API web3 de Binance (X-OC-APIKEY / X-OC-TIMESTAMP / X-OC-SIGN).
 * La firma cubre `timestamp + MÉTODO + "/build" + path + "?" + query + cuerpo`; el cuerpo es
 * JSON compacto sin campos `null`. Verificado contra el SDK oficial (`binance_common.utils.web3_signature`).
 *
 * Tres formas de credencial, en este orden:
 * - `BINANCE_API_SECRET`: HMAC-SHA256, base64.
 * - `BINANCE_PRIVATE_KEY`: PEM o ruta al PEM, RSA o Ed25519 (se detecta), base64 de la firma.
 * - Sin credencial: `binanceWeb3Signer` devuelve `null` y nada sale firmado.
 */

export const WEB3_BASE_URL = "https://web3.binance.com";

export type BinanceCredentials =
  | { kind: "hmac"; apiKey: string; secret: string }
  | { kind: "private-key"; apiKey: string; privateKey: string; passphrase?: string };

/** Lee las credenciales del entorno. `null` si falta la key o cualquier forma de firma. */
export function binanceCredentials(
  env: Record<string, string | undefined> = process.env,
): BinanceCredentials | null {
  const apiKey = env.BINANCE_API_KEY?.trim();
  if (!apiKey) return null;
  const secret = env.BINANCE_API_SECRET?.trim();
  if (secret) return { kind: "hmac", apiKey, secret };
  const privateKey = env.BINANCE_PRIVATE_KEY?.trim();
  if (privateKey) {
    return { kind: "private-key", apiKey, privateKey, passphrase: env.BINANCE_PRIVATE_KEY_PASSPHRASE };
  }
  return null;
}

/** Los tres headers que espera `/build`. Lanza si la clave privada no se entiende. */
export function signWeb3Request(
  credentials: BinanceCredentials,
  method: string,
  requestPath: string,
  body?: Record<string, unknown>,
): Record<string, string> {
  const timestamp = new Date().toISOString();
  const bodyStr = body === undefined ? "" : compactJson(body);
  const payload = `${timestamp}${method.toUpperCase()}${requestPath}${bodyStr}`;
  const sign =
    credentials.kind === "hmac"
      ? createHmac("sha256", credentials.secret).update(payload, "utf8").digest("base64")
      : signWithKey(credentials.privateKey, credentials.passphrase, payload);
  return {
    "X-OC-APIKEY": credentials.apiKey,
    "X-OC-TIMESTAMP": timestamp,
    "X-OC-SIGN": sign,
  };
}

/**
 * El `SignRequest` que consumen los adaptadores (`rwa.ts`, `trading.ts`).
 * `requestPath` ya llega con `/build`, path, query y signado en ese orden.
 * Devuelve `null` sin credenciales: quien orquesta decide si trabaja en modo público.
 */
export function binanceWeb3Signer(
  env: Record<string, string | undefined> = process.env,
): SignRequest | null {
  const credentials = binanceCredentials(env);
  if (credentials === null) return null;
  return (method, requestPath, body) => {
    const parsed = body === "" ? undefined : (JSON.parse(body) as Record<string, unknown>);
    return Promise.resolve(signWeb3Request(credentials, method, requestPath, parsed));
  };
}

/** JSON compacto sin campos `null`/`undefined`, como `clean_none_value` + separators del SDK. */
export function compactJson(value: Record<string, unknown>): string {
  const clean = (input: unknown): unknown => {
    if (input === null || input === undefined) return undefined;
    if (Array.isArray(input)) return input.map(clean);
    if (typeof input === "object") {
      return Object.fromEntries(
        Object.entries(input as Record<string, unknown>)
          .map(([name, inner]) => [name, clean(inner)] as const)
          .filter(([, inner]) => inner !== undefined),
      );
    }
    return input;
  };
  return JSON.stringify(clean(value));
}

function signWithKey(privateKeyInput: string, passphrase: string | undefined, payload: string): string {
  const pem = readPem(privateKeyInput);
  const key = createPrivateKey({ key: pem, passphrase });
  // Ed25519 no toma algoritmo de hash; RSA firma SHA-256 (PKCS1-v1_5, como el SDK).
  const signature =
    key.asymmetricKeyType === "ed25519"
      ? cryptoSign(null, Buffer.from(payload, "utf8"), key)
      : cryptoSign("sha256", Buffer.from(payload, "utf8"), key);
  return signature.toString("base64");
}

/**
 * El `.env` puede traer el PEM en una línea con `\n` literales o una ruta al archivo
 * (como el SDK: si la ruta existe, se lee; si no, se toma como contenido).
 */
function readPem(input: string): string {
  if (input.includes("BEGIN")) return input.replace(/\\n/g, "\n");
  try {
    return readFileSync(input, "utf8");
  } catch {
    return input;
  }
}
