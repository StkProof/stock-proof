/** `supportsInterface(bytes4)` de ERC-165. */
const ERC165_SELECTOR = "0x01ffc9a7";

/** JSON-RPC: código que usan los nodos para «execution reverted». */
const REVERT_CODE = 3;

const TIMEOUT_MS = 10_000;

/**
 * `supportsInterface(interfaceId)` por `eth_call` a BSC (`BSC_RPC_URL`). No es Binance: no pasa
 * por `binanceRequest` ni se anota. Un revert o una respuesta vacía es `false` (un BEP-20 común
 * sin ERC-165); red, HTTP u otro error del nodo es `"unavailable"`. Sin URL de RPC, lanza.
 */
export async function supportsInterface(
  address: string,
  interfaceId: string,
  rpcUrl: string | undefined = process.env.BSC_RPC_URL,
): Promise<boolean | "unavailable"> {
  if (!rpcUrl) {
    throw new Error("falta BSC_RPC_URL: la pregunta 1 no puede leer el estándar en BSC");
  }

  const data = ERC165_SELECTOR + interfaceId.replace(/^0x/, "").padEnd(64, "0");
  let body: unknown;
  try {
    const response = await fetch(rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "eth_call",
        params: [{ to: address, data }, "latest"],
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) return "unavailable";
    body = await response.json();
  } catch {
    return "unavailable";
  }

  if (!isRecord(body)) return "unavailable";
  if (isRecord(body.error)) {
    const { code, message } = body.error;
    const reverted = code === REVERT_CODE || (typeof message === "string" && /revert/i.test(message));
    return reverted ? false : "unavailable";
  }
  return decodeBool(body.result);
}

/** `0x` vacío es `false`; solo `1` es `true`. Un resultado que no es hex es `"unavailable"`. */
function decodeBool(result: unknown): boolean | "unavailable" {
  if (typeof result !== "string" || !/^0x[0-9a-f]*$/i.test(result)) return "unavailable";
  if (result === "0x") return false;
  return BigInt(result) === 1n;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
