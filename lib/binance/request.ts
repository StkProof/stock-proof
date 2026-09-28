import {
  isSecretName,
  messageOf,
  readForLog,
  redactParams,
  resolveCaller,
  resolveEnv,
  scrubSecrets,
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
/**
 * Hosts a los que la puerta manda la key: `binance.com` y sus subdominios, solo por https.
 * Si una API de Binance vive en otro dominio, se agrega acá y en la spec.
 */
export const ALLOWED_HOST_SUFFIXES = ["binance.com"] as const;

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

  const secrets = collectSecrets(req);

  let response: Response;
  try {
    assertBinanceHost(req.url);
    response = await fetch(req.url, { method, headers: req.headers, body: req.body });
  } catch (error) {
    const durationMs = elapsed(start);
    const message = scrubSecrets(messageOf(error), secrets);
    await writeCallLog(line(durationMs, { status: null, ok: false, error: message, response: null }));
    throw error;
  }
  const durationMs = elapsed(start);

  let logged: LoggedResponse | null = null;
  try {
    logged = truncateResponse(scrubSecrets(await readForLog(response), secrets));
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

/** Frena la llamada antes de que la key salga hacia un host que no es de Binance. */
function assertBinanceHost(url: string): void {
  const { protocol, hostname } = new URL(url);
  const allowed = ALLOWED_HOST_SUFFIXES.some(
    (suffix) => hostname === suffix || hostname.endsWith(`.${suffix}`),
  );
  if (protocol !== "https:" || !allowed) {
    throw new Error(`host no permitido para Binance: ${protocol}//${hostname}`);
  }
}

/** Valores de headers, query string y `params` con nombre de secreto, para taparlos en la respuesta. */
function collectSecrets(req: BinanceRequest): string[] {
  const found: string[] = [];
  try {
    new Headers(req.headers).forEach((value, name) => {
      if (isSecretName(name)) found.push(value);
    });
  } catch {
    // Headers inválidos: el error lo da `fetch`, no esta revisión.
  }
  try {
    new URL(req.url).searchParams.forEach((value, name) => {
      if (isSecretName(name)) found.push(value);
    });
  } catch {
    // URL inválida: no hay query string que revisar.
  }
  const visit = (value: unknown, seen: WeakSet<object>) => {
    if (value === null || typeof value !== "object" || seen.has(value)) return;
    seen.add(value);
    for (const [name, inner] of Object.entries(value)) {
      if (isSecretName(name) && typeof inner === "string") found.push(inner);
      else visit(inner, seen);
    }
  };
  visit(req.params, new WeakSet());
  return found;
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
