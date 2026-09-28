import { getUnderlyingProfile, searchRwa, type RwaDeps } from "@/lib/binance/rwa";
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

/**
 * Pregunta 1 para un contrato. Consulta en orden (lista, attestation, estándar) y deja de
 * consultar en el primer corte. La decisión es de `decideAuthenticity`.
 */
export async function checkContract(target: ContractTarget, deps: Q1Deps): Promise<Q1Result> {
  const rwa: RwaDeps = {
    ...deps.rwa,
    context: { ...deps.rwa.context, purpose: "q1", ticker: target.ticker, wrapper: target.wrapper },
  };

  const search = hasOfficialList(target.wrapper) ? await searchRwa(target.ticker, rwa) : null;
  const listed = checkListing(target, search).ok;

  const profile = listed ? await getUnderlyingProfile(BSC_CHAIN_ID, target.address, rwa) : null;
  const attested = listed && checkAttestation(profile).ok;

  const standard =
    attested && requiresStandard(target.wrapper)
      ? await supportsInterface(target.address, BEP8056_INTERFACE_ID, deps.rpcUrl)
      : null;

  return decideAuthenticity({ ...target, search, profile, standard });
}
