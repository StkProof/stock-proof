import type { RwaSearchResult, UnderlyingProfile } from "@/lib/binance/rwa";
import type { WrapperId } from "@/lib/evaluate";
import type { Q1Result } from "@/lib/questions/q1-reasons";

/** BSC mainnet, como lo escribe RWA Data. */
export const BSC_CHAIN_ID = "56";

/** Plataforma de RWA Data para cada wrapper. xStocks no está en RWA Data (ADR 0002). */
const PLATFORM_OF: Record<WrapperId, string | null> = {
  bstocks: "bstock",
  ondo: "ondo",
  xstocks: null,
};

const ADDRESS = /^0x[0-9a-f]{40}$/;

const PASS: Q1Result = { ok: true };

export type ContractTarget = {
  ticker: string;
  wrapper: WrapperId;
  address: string;
};

/**
 * Lo ya traído para un contrato. `null` es «no se consultó»: si el orden de corte llega a ese
 * chequeo, se trata como no disponible.
 */
export type AuthenticityData = ContractTarget & {
  search: RwaSearchResult[] | "unavailable" | null;
  profile: UnderlyingProfile | "unavailable" | null;
  standard: boolean | "unavailable" | null;
};

/**
 * Pregunta 1 para un contrato: lista oficial, attestation y, en bStocks, BEP-8056. El primero
 * que falla corta. No llama a la red.
 */
export function decideAuthenticity(data: AuthenticityData): Q1Result {
  const steps = [
    () => checkListing(data, data.search),
    () => checkAttestation(data.profile),
    () => (requiresStandard(data.wrapper) ? checkStandard(data.standard) : PASS),
  ];
  for (const step of steps) {
    const result = step();
    if (!result.ok) return result;
  }
  return PASS;
}

/** xStocks no tiene lista oficial en Binance: no se consulta y su pregunta 1 es `LIST_UNAVAILABLE`. */
export function hasOfficialList(wrapper: WrapperId): boolean {
  return PLATFORM_OF[wrapper] !== null;
}

/** La dirección tiene que ser, completa, la oficial de ese ticker y ese wrapper en la chain 56. */
export function checkListing(
  target: ContractTarget,
  search: RwaSearchResult[] | "unavailable" | null,
): Q1Result {
  const platform = PLATFORM_OF[target.wrapper];
  if (platform === null || search === null || search === "unavailable") {
    return { ok: false, reason: "LIST_UNAVAILABLE" };
  }

  // Por el subyacente (`QQQ`) cuentan todos sus tokens; por el símbolo (`QQQB`), solo ese token.
  const ticker = normalize(target.ticker);
  const onBsc = search
    .flatMap((result) =>
      normalize(result.ticker) === ticker
        ? result.assets
        : result.assets.filter((asset) => normalize(asset.tokenSymbol) === ticker),
    )
    .filter((asset) => asset.binanceChainId === BSC_CHAIN_ID);
  if (onBsc.length === 0) {
    return { ok: false, reason: "TICKER_NOT_FOUND" };
  }

  const address = normalize(target.address);
  const official =
    ADDRESS.test(address) &&
    onBsc.some(
      (asset) =>
        asset.platformId === platform && normalize(asset.tokenContractAddress) === address,
    );
  return official ? PASS : { ok: false, reason: "CONTRACT_NOT_LISTED" };
}

/** Alcanza con un reporte publicado (`supported: true`). No se lee ni su contenido ni su fecha. */
export function checkAttestation(profile: UnderlyingProfile | "unavailable" | null): Q1Result {
  if (profile === null || profile === "unavailable") {
    return { ok: false, reason: "ATTESTATION_UNAVAILABLE" };
  }
  return profile.attestations.some((report) => report.supported)
    ? PASS
    : { ok: false, reason: "ATTESTATION_MISSING" };
}

/** La spec pide BEP-8056 solo en bStocks. */
export function requiresStandard(wrapper: WrapperId): boolean {
  return wrapper === "bstocks";
}

export function checkStandard(standard: boolean | "unavailable" | null): Q1Result {
  if (standard === null || standard === "unavailable") {
    return { ok: false, reason: "CHAIN_UNAVAILABLE" };
  }
  return standard ? PASS : { ok: false, reason: "STANDARD_NOT_BEP8056" };
}

function normalize(text: string): string {
  return text.trim().toLowerCase();
}
