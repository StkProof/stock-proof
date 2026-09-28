import {
  messageOf,
  readForLog,
  redactParams,
  resolveCaller,
  resolveEnv,
  truncateResponse,
  writeCallLog,
  type BinanceApi,
  type CallContext,
  type CallLogEntry,
  type LoggedResponse,
} from "@/lib/binance/call-log";

/**
 * La única salida a Binance (ADR 0001). Corre solo en el servidor: la key viaja en `headers`
 * y nunca se anota.
 */
export type BinanceRequest = {
  api: BinanceApi;
  /** URL completa. */
  url: string;
  /** Por defecto `GET`. */
  method?: string;
  /** Lo que se manda, solo para el registro. */
  params?: Record<string, unknown>;
  body?: BodyInit;
  /** Acá viaja la key; nunca se anota. */
  headers?: HeadersInit;
  context?: CallContext;
};

/**
 * Hace la llamada, la anota y devuelve la `Response` de Binance sin tocar. Si la red falla,
 * anota el error y lo vuelve a lanzar. Sin reintentos, caché ni lógica de endpoints.
 */
export async function binanceRequest(req: BinanceRequest): Promise<Response> {
  const method = req.method ?? "GET";
  const ts = new Date().toISOString();
  const start = performance.now();

  const line = (
    durationMs: number,
    fields: Pick<CallLogEntry, "status" | "ok" | "error" | "response">,
  ): CallLogEntry => ({
    ts,
    caller: resolveCaller(),
    env: resolveEnv(),
    api: req.api,
    endpoint: endpointOf(req.url),
    method,
    params: redactParams(req.params ?? {}),
    context: redactParams(req.context ?? {}) as CallContext,
    durationMs,
    ...fields,
  });

  let response: Response;
  try {
    response = await fetch(req.url, { method, headers: req.headers, body: req.body });
  } catch (error) {
    const durationMs = elapsed(start);
    await writeCallLog(
      line(durationMs, { status: null, ok: false, error: messageOf(error), response: null }),
    );
    throw error;
  }
  const durationMs = elapsed(start);

  let logged: LoggedResponse | null = null;
  try {
    logged = truncateResponse(await readForLog(response));
  } catch {
    // Si no se puede leer el clon, la línea queda sin cuerpo y la llamada sigue.
  }

  await writeCallLog(
    line(durationMs, {
      status: response.status,
      ok: response.ok,
      error: response.ok ? null : `HTTP ${response.status}`,
      response: logged,
    }),
  );
  return response;
}

function elapsed(start: number): number {
  return Math.round(performance.now() - start);
}

/** Ruta sin host ni query string. Con una URL inválida no lanza: el error que importa es el de `fetch`. */
function endpointOf(url: string): string {
  try {
    return new URL(url).pathname;
  } catch {
    return url.split("?")[0];
  }
}
