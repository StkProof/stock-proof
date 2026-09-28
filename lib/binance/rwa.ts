import type { CallContext } from "@/lib/binance/call-log";
import { binanceRequest } from "@/lib/binance/request";

/** La ruta firmada incluye `/build` (documentación de autenticación, 28 sep 2026). */
export const RWA_BASE_URL = "https://web3.binance.com/build";

/**
 * Arma los headers de autenticación (`X-OC-APIKEY`, `X-OC-TIMESTAMP`, `X-OC-SIGN`). La firma es
 * del cliente de Agustín (issue #2); acá solo se recibe. `requestPath` incluye `/build` y la query.
 */
export type SignRequest = (
  method: string,
  requestPath: string,
  body: string,
) => HeadersInit | Promise<HeadersInit>;

export type RwaDeps = {
  sign: SignRequest;
  /** Por defecto `RWA_BASE_URL`. */
  baseUrl?: string;
  context?: CallContext;
};

export type RwaAsset = {
  platformId: string;
  binanceChainId: string;
  tokenContractAddress: string;
  tokenSymbol: string;
};

export type RwaSearchResult = {
  ticker: string;
  assets: RwaAsset[];
};

export type AttestationReport = {
  /** Nombre del campo en `protections`, por ejemplo `dailyAttestationReport`. */
  name: string;
  supported: boolean;
  url: string | null;
};

export type UnderlyingProfile = {
  attestations: AttestationReport[];
};

/** `GET /api/v1/dex/market/rwa/search`. `"unavailable"` si falla la red, el HTTP, el `code` o el formato. */
export async function searchRwa(
  keyword: string,
  deps: RwaDeps,
): Promise<RwaSearchResult[] | "unavailable"> {
  const data = await rwaGet("/api/v1/dex/market/rwa/search", { keyword: keyword.trim() }, deps);
  if (data === UNAVAILABLE || !Array.isArray(data)) return "unavailable";

  const results: RwaSearchResult[] = [];
  for (const item of data) {
    if (!isRecord(item) || typeof item.ticker !== "string" || !Array.isArray(item.assets)) {
      return "unavailable";
    }
    const assets = item.assets.map(toAsset);
    if (assets.some((asset) => asset === null)) return "unavailable";
    results.push({ ticker: item.ticker, assets: assets as RwaAsset[] });
  }
  return results;
}

/** `GET /api/v1/dex/market/rwa/underlying-profile`. `data: null` también es `"unavailable"`. */
export async function getUnderlyingProfile(
  binanceChainId: string,
  tokenContractAddress: string,
  deps: RwaDeps,
): Promise<UnderlyingProfile | "unavailable"> {
  const data = await rwaGet(
    "/api/v1/dex/market/rwa/underlying-profile",
    { binanceChainId, tokenContractAddress },
    deps,
  );
  if (data === UNAVAILABLE || !isRecord(data)) return "unavailable";

  const protections = isRecord(data.protections) ? data.protections : {};
  const attestations = Object.entries(protections)
    .filter((entry): entry is [string, Record<string, unknown>] => isRecord(entry[1]))
    .map(([name, report]) => ({
      name,
      supported: report.supported === true,
      url: typeof report.url === "string" ? report.url : null,
    }));
  return { attestations };
}

const UNAVAILABLE = Symbol("unavailable");

/** Firma, llama por la puerta (ADR 0001) y devuelve `data`, o `UNAVAILABLE`. Un error al firmar sí se lanza: es configuración. */
async function rwaGet(
  path: string,
  query: Record<string, string>,
  deps: RwaDeps,
): Promise<unknown> {
  const base = new URL(deps.baseUrl ?? RWA_BASE_URL);
  const queryString = Object.entries(query)
    .map(([name, value]) => `${encodeURIComponent(name)}=${encodeURIComponent(value)}`)
    .join("&");
  const requestPath = `${base.pathname.replace(/\/$/, "")}${path}?${queryString}`;
  const headers = await deps.sign("GET", requestPath, "");

  let response: Response;
  try {
    response = await binanceRequest({
      api: "rwa",
      url: `${base.origin}${requestPath}`,
      params: query,
      headers,
      context: deps.context,
    });
  } catch {
    return UNAVAILABLE;
  }
  if (!response.ok) return UNAVAILABLE;

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return UNAVAILABLE;
  }
  if (!isRecord(body) || (body.code !== 0 && body.code !== "0")) return UNAVAILABLE;
  return body.data;
}

function toAsset(value: unknown): RwaAsset | null {
  if (!isRecord(value)) return null;
  const chain = value.binanceChainId;
  if (
    typeof value.platformId !== "string" ||
    (typeof chain !== "string" && typeof chain !== "number") ||
    typeof value.tokenContractAddress !== "string"
  ) {
    return null;
  }
  return {
    platformId: value.platformId,
    binanceChainId: String(chain),
    tokenContractAddress: value.tokenContractAddress,
    tokenSymbol: typeof value.tokenSymbol === "string" ? value.tokenSymbol : "",
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
