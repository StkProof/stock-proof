import { getUnderlyingProfile, searchRwa, type RwaDeps } from "@/lib/binance/rwa";
import type { RwaSearchResult, UnderlyingProfile } from "@/lib/binance/rwa";
import { supportsInterface } from "@/lib/chain/supports-interface";
import {
  BSC_CHAIN_ID,
  checkAttestation,
  checkListing,
  decideAuthenticity,
  hasOfficialList,
  requiresStandard,
  type ContractTarget,
} from "@/lib/questions/q1-authenticity";
import type { Q1Result } from "@/lib/questions/q1-reasons";

/** BEP-677 (EIP-8056 Scaled UI Amount): lo que BscScan muestra como BEP-8056. */
export const BEP8056_INTERFACE_ID = "0xa60bf13d";

export type Q1Deps = {
  rwa: RwaDeps;
  /** Por defecto `BSC_RPC_URL`. */
  rpcUrl?: string;
};

/** Las tres consultas que necesita la pregunta 1, ya traídas. La decisión no cambia de fuente. */
export type Q1Sources = {
  search(keyword: string): Promise<RwaSearchResult[] | "unavailable">;
  profile(chainId: string, tokenContractAddress: string): Promise<UnderlyingProfile | "unavailable">;
  standard(address: string, interfaceId: string): Promise<boolean | "unavailable">;
};

/** Las fuentes firmadas de RWA Data + el nodo de BSC. Lo que venía usando `checkContract`. */
export function signedQ1Sources(deps: Q1Deps): Q1Sources {
  return {
    search: (keyword) => searchRwa(keyword, deps.rwa),
    profile: (chainId, address) => getUnderlyingProfile(chainId, address, deps.rwa),
    standard: (address, interfaceId) => supportsInterface(address, interfaceId, deps.rpcUrl),
  };
}

/**
 * Pregunta 1 para un contrato. Consulta en orden (lista, attestation, estándar) y deja de
 * consultar en el primer corte. La decisión es de `decideAuthenticity`.
 */
export async function checkContract(target: ContractTarget, deps: Q1Deps): Promise<Q1Result> {
  const rwa: RwaDeps = {
    ...deps.rwa,
    context: { ...deps.rwa.context, purpose: "q1", ticker: target.ticker, wrapper: target.wrapper },
  };
  return checkContractSources(target, {
    search: (keyword) => searchRwa(keyword, rwa),
    profile: (chainId, address) => getUnderlyingProfile(chainId, address, rwa),
    standard: (address, interfaceId) => supportsInterface(address, interfaceId, deps.rpcUrl),
  });
}

/**
 * La misma pregunta 1 con fuentes inyectadas: la API pública de la web cubre lista y attestation
 * sin credenciales, y el estándar sale del mismo `supportsInterface`.
 */
export async function checkContractSources(
  target: ContractTarget,
  sources: Q1Sources,
): Promise<Q1Result> {
  const search = hasOfficialList(target.wrapper) ? await sources.search(target.ticker) : null;
  const listed = checkListing(target, search).ok;

  const profile = listed ? await sources.profile(BSC_CHAIN_ID, target.address) : null;
  const attested = listed && checkAttestation(profile).ok;

  const standard =
    attested && requiresStandard(target.wrapper)
      ? await sources.standard(target.address, BEP8056_INTERFACE_ID)
      : null;

  return decideAuthenticity({ ...target, search, profile, standard });
}
