import { evaluate } from "@/lib/evaluate";
import { buildEvaluateInput, realInputDeps } from "@/lib/evaluation-input";

/**
 * `POST /api/evaluate` — `{ ticker, amountUsd, address? }` → `Evaluation`.
 * La entrada inválida la resuelve `evaluate` en local (no llama a las APIs).
 * Corre solo en el servidor: las credenciales y el nodo RPC no llegan al browser.
 */
export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    body = null;
  }
  const input = isRecord(body) ? body : {};

  const ticker = typeof input.ticker === "string" ? input.ticker : "";
  const amountUsd =
    typeof input.amountUsd === "number"
      ? input.amountUsd
      : Number(String(input.amountUsd ?? "").replace(",", "."));
  const address =
    typeof input.address === "string" && input.address.trim().length > 0
      ? input.address.trim()
      : undefined;

  const evaluation = evaluate(
    await buildEvaluateInput({ ticker, amountUsd, address }, realInputDeps()),
  );
  return Response.json(evaluation);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
