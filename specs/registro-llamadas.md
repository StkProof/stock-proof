# Spec: registro de llamadas a Binance

- **Estado**: borrador (falta la aprobación de Agustín)
- **Fecha**: 2026-09-28
- **Aprobación**: pendiente. Lautaro pidió implementarla en la misma rama (28 sep 2026); la aprobación de Agustín en el pull request aprueba spec e implementación juntas
- **Autor**: Lautaro, a partir de `../stockproof-vault/Plan.md` (ola 0) y del acuerdo con Agustín del 28 sep 2026: todas las llamadas a Binance pasan por una sola función

## Contexto y problema

El Developer Experience Report vale el 25% del puntaje. El jurado pide números concretos: slippage, gap contra la referencia, comportamiento fuera de horario y diferencias entre bStocks, Ondo y xStocks. Las reglas rechazan los informes genéricos o reconstruidos al final. El vault fija que el log se arma desde la primera llamada, no el 10 oct, e incluye la venta del mismo monto.

Los tres usamos la misma API key, así que el log mezcla pruebas, desarrollo y demo. Si no se sabe quién hizo cada llamada, el 10 oct no hay forma de clasificarlas. Clasificar no es descartar: los errores y trabas que aparecen mientras desarrollamos (un 429, un endpoint que no hace lo que dice la documentación) son la parte de «fricción con la API» del informe. Las llamadas controladas y las de la demo son las que dan los números de mercado.

Para que esos números sean confiables, el registro tiene que permitir tres cosas que un log común no permite: comparar los tres wrappers cotizados en el mismo momento, comparar una cotización con la transacción que salió de ella, y saber de cuándo es el precio de referencia contra el que se calcula el gap.

Esta spec fija dos piezas: una sola puerta por la que salen todas las llamadas a Binance, y un registro que anota cada llamada. El cliente de Agustín se construye encima de esa puerta. El informe y el script que lo resume quedan fuera.

## Comportamiento esperado

1. Cualquier parte del servidor que necesite Binance llama a `binanceRequest` en `lib/binance/request.ts`. No hay otra salida.
2. `binanceRequest` hace la llamada, mide cuánto tardó y devuelve la respuesta de Binance **sin modificarla**.
3. Por cada llamada, bien o mal, se agrega una línea al registro.
4. Si Binance responde con error o la red falla, el error se anota y **después** llega a quien llamó, igual que si no hubiera registro.
5. Si no se puede escribir el registro (disco, permisos, deploy de solo lectura), la llamada sigue y devuelve su resultado. El registro nunca rompe la app.

## Qué anota cada línea

Una línea JSON por llamada.

| Campo | Qué es | De dónde sale |
| --- | --- | --- |
| `ts` | Fecha y hora UTC en ISO 8601, del momento en que salió la llamada | Reloj del servidor |
| `caller` | Quién llamó: `lautaro`, `agustin`, `luciano`, `demo`, `test` o `desconocido` | `STOCKPROOF_CALLER` del `.env` |
| `env` | Desde dónde: `local`, `ci` o `desconocido` | `STOCKPROOF_ENV` del `.env` |
| `api` | Qué API de Binance: `rwa`, `trading`, `transaction`, `market`, `wallet` | Quien llama a la puerta |
| `endpoint` | Ruta del endpoint, sin la parte del host | Quien llama a la puerta |
| `method` | `GET`, `POST`, etc. | Quien llama a la puerta |
| `params` | Lo que se mandó, sin datos secretos (ver reglas) | Quien llama a la puerta |
| `context` | Para qué fue: `ticker`, `amountUsd`, `side` (`buy` o `sell`), `wrapper` (`bstocks`, `ondo`, `xstocks`), `purpose` (por ejemplo `q1`, `q2`, `exit-now`), `evaluationId`, `referencePriceAt`, `txHash` (ver abajo). Todos opcionales | Quien llama a la puerta |
| `status` | Código HTTP, o `null` si la red falló antes de responder | Respuesta |
| `ok` | Verdadero si la llamada salió bien | Respuesta |
| `durationMs` | Milisegundos desde que salió hasta que volvió | Medido por la puerta |
| `error` | Mensaje de error, o `null` | Respuesta o excepción |
| `response` | Cuerpo de la respuesta, recortado a 20 KB con `truncated: true` si se cortó | Respuesta |

`context` existe para que el informe se pueda armar sin volver a interpretar cada respuesta: filtrar por wrapper, por compra o venta, por ticker.

Tres campos de `context` sirven para medir bien, no solo para filtrar:

| Campo | Qué es | Para qué sirve en el informe |
| --- | --- | --- |
| `evaluationId` | Un identificador que comparten todas las llamadas de una misma evaluación: las cotizaciones de los tres wrappers, la compra y la venta del mismo monto y, si se firma, la transacción | Comparar wrappers cotizados en el mismo momento (y no con minutos de diferencia). Calcular el costo de ida y vuelta: compra y venta del mismo monto, juntas. Unir una cotización con su ejecución |
| `referencePriceAt` | Fecha y hora, en ISO 8601 UTC, del precio de referencia de la acción que se usó (por ejemplo, el cierre del viernes si es sábado) | Saber si el gap se calculó contra un precio actual o contra uno de hace horas o días. Sin esto, un gap de fin de semana y uno de un martes parecen el mismo dato |
| `txHash` | El hash de la transacción en BSC, solo en llamadas que firman | Comparar el slippage cotizado con el ejecutado de verdad |

La puerta no inventa estos valores: los pasa quien llama. Para que el identificador sea siempre del mismo tipo, `lib/binance/call-log.ts` ofrece `newEvaluationId()`.

## Reglas fijas

- **Nunca se anota la API key ni el secreto.** No se guardan los headers. En `params` y en `context`, cualquier campo llamado `apiKey`, `secret`, `signature` o parecido se reemplaza por `"[oculto]"`; lo mismo corre para el cuerpo JSON de la respuesta que se guarda parseado.
- **Si Binance repite un secreto en la respuesta, se tapa.** Antes de anotar el cuerpo, los valores de headers, query string y `params` con nombre de secreto se reemplazan por `"[oculto]"`. Quien llama recibe la respuesta intacta.
- **La key solo sale hacia Binance.** La puerta solo llama por https a `binance.com` y sus subdominios (`ALLOWED_HOST_SUFFIXES` en `lib/binance/request.ts`). Otro host se rechaza antes de llamar, se anota con `status: null` y lanza un error. Si una API de Binance vive en otro dominio, se agrega a la lista y a esta spec.
- **El registro no cambia el resultado.** Lo que devuelve la puerta es exactamente lo que devolvió Binance, con o sin registro.
- **Sin `caller`, la línea queda como `desconocido`.** No se borra: el resumen decide cómo clasificarla.
- **Clasificar, no descartar.** Ninguna línea se borra del registro. El resumen separa fricción de desarrollo (errores, límites, documentación) de números de mercado (llamadas controladas y demo).
- La puerta corre solo en el servidor. La key no llega al browser (regla que ya está en `AGENTS.md`).

## Dónde vive el registro

- Un archivo por persona: `logs/binance-calls-<caller>.jsonl`. Por ejemplo, `logs/binance-calls-lautaro.jsonl`.
- Los archivos **se suben al repo**. Como cada uno escribe solo en el suyo, juntar cambios no genera conflictos, y el 10 oct todos los datos ya están en un solo lugar.
- La carpeta se puede cambiar con `STOCKPROOF_LOG_DIR`, para que los tests escriban en una carpeta temporal y no ensucien `logs/`.

## Criterios de aceptación

- [ ] Una llamada que sale bien deja una línea con todos los campos de la tabla, y la puerta devuelve la respuesta sin cambios (cómo se comprueba: unitario `tests/binance-request.test.ts` con `fetch` sustituido por un doble).
- [ ] Una llamada con error HTTP deja una línea con `ok: false`, `status` y `error`, y quien llamó recibe el error igual que sin registro (cómo se comprueba: unitario).
- [ ] Una falla de red deja una línea con `status: null` y el error, y el error llega a quien llamó (cómo se comprueba: unitario).
- [ ] La API key, el secreto y la firma no aparecen en ninguna línea del registro (cómo se comprueba: unitario que busca esos valores en el archivo escrito).
- [ ] Si escribir el registro falla, la puerta devuelve igual la respuesta de Binance (cómo se comprueba: unitario con la carpeta de logs apuntando a un lugar donde no se puede escribir).
- [ ] Sin `STOCKPROOF_CALLER`, la línea tiene `caller: "desconocido"` y va a `logs/binance-calls-desconocido.jsonl` (cómo se comprueba: unitario).
- [ ] `evaluationId`, `referencePriceAt` y `txHash` se guardan en la línea tal como los pasó quien llamó, y dos llamadas con el mismo `evaluationId` quedan unidas por ese valor (cómo se comprueba: unitario).
- [ ] `newEvaluationId()` devuelve un identificador distinto en cada llamada (cómo se comprueba: unitario).
- [ ] Dos llamadas seguidas dejan dos líneas, en orden, cada una JSON válido por sí sola (cómo se comprueba: unitario).
- [ ] `.env.example` documenta `STOCKPROOF_CALLER`, `STOCKPROOF_ENV` y `STOCKPROOF_LOG_DIR`.
- [ ] `npm run check` sigue en verde.

## Casos borde

- Respuesta que no es JSON (por ejemplo, una página de error HTML): se guarda como texto, recortada a 20 KB.
- Respuesta muy grande: se recorta a 20 KB y se marca `truncated: true`. El resto no se guarda. El corte no deja un carácter UTF-8 a medias; un «�» que venía en la respuesta se conserva.
- `params` con referencias circulares: la repetición se anota como `"[circular]"` y la llamada sigue.
- Llamadas en paralelo: cada una escribe su línea completa. El orden de las líneas es el orden en que terminaron.
- Deploy con disco de solo lectura: el registro falla sin romper nada. Los datos del informe salen de las corridas locales y de la demo.
- `STOCKPROOF_CALLER` con un valor fuera de la lista: se anota tal cual, para no perder la línea, y el resumen decide qué hacer con ella.

## Fuera de alcance

- El script que lee el registro y saca los números del informe (desde la ola 1, cuando haya llamadas reales).
- Normalizar precios a precio por acción cuando el token tiene multiplicador. Va con la pregunta 3; el registro guarda la respuesta cruda.
- La tarea programada que cotiza los mismos tickers y montos en horarios fijos (abierto, cerrado, fin de semana). Tiene su propia spec, después de chequear los límites de uso de la API.
- Las notas a mano de la plantilla del README (documentación confusa, rodeos, sugerencias).
- El cliente de Agustín y los endpoints concretos de cada API. La puerta recibe la ruta; no sabe qué endpoints existen.
- Calcular slippage, gap o mercado abierto o cerrado. El registro guarda lo que volvió; las cuentas se hacen después.
- El texto del Developer Experience Report.

## Decisiones técnicas

- **Una sola puerta**: si hubiera varias salidas a Binance, alguna quedaría sin registro. Acordado con Agustín el 28 sep 2026. Decisión completa, con alternativas descartadas, en `docs/adr/0001-una-sola-puerta-binance.md`.
- **`fetch` de Node, sin librerías nuevas**: el repo no tiene cliente HTTP. Una línea por llamada no justifica sumar pino ni axios. Si el cliente de Agustín usa otra cosa, igual pasa por la puerta.
- **JSON Lines (una línea por llamada)**: se agrega sin reescribir el archivo, se filtra con cualquier herramienta y una línea rota no invalida las demás.
- **Un archivo por persona y subido al repo**: evita conflictos y deja los datos juntos para el informe. Si el equipo prefiere no subirlos, se cambia la spec antes de implementar.
- **`context` lo pasa quien llama**: la puerta no interpreta respuestas de Binance. Quien sabe para qué llamó es quien tiene que decirlo.
- **`evaluationId`, `referencePriceAt` y `txHash` desde el día uno**: cuestan un campo cada uno, pero sin ellos las primeras llamadas quedan sin poder compararse. La mayoría de los informes van a reportar slippage cotizado como si fuera real y gaps de fin de semana como si fueran actuales; estos campos permiten no cometer esos errores.
- **Clasificar en vez de descartar**: la fricción con la API durante el desarrollo es parte de lo que pide el informe.
- **Recorte a 20 KB**: alcanza para cotizaciones y listas, y evita que un archivo crezca sin control. Si una respuesta importante queda cortada, se sube el límite en la spec.

## Plan de implementación (para el agente)

Instrucciones para quien implemente esta spec. Seguir en orden. Todo lo que no esté acá está fuera de alcance.

### Antes de empezar

1. Leer `AGENTS.md` y `progress/current.md`. Correr `./init.sh`. Si falla, arreglar el entorno antes de seguir.
2. **Condición para programar:** esta spec tiene que decir `Estado: aprobada` en su encabezado. Si dice `borrador`, parar y avisar: el harness no permite implementar sin aprobación. Excepción para esta primera implementación: Lautaro pidió programarla junto con la spec, y el pull request no se une sin la aprobación de Agustín.
3. Leer `docs/adr/0001-una-sola-puerta-binance.md`. Es la decisión de fondo.
4. Trabajar en una rama nueva, `feat/registro-llamadas`, a partir de `develop`.

### Paso 1: registrar la tarea

Archivar la tarea actual de `progress/current.md` en `progress/history/2026-09-27-base-evaluate.md` si todavía no está (ya existe: no duplicar). Reemplazar `progress/current.md` con esta tarea, en el mismo formato que la anterior:

- Título: `Tarea: Registro de llamadas a Binance`.
- `Spec: specs/registro-llamadas.md`.
- Los criterios de aceptación de esta spec, sin tildar.
- Plan: los pasos 2 a 6 de esta sección.
- Decisiones: una sola puerta (ADR 0001), un archivo por persona subido al repo, sin dependencias nuevas.

### Paso 2: tipos y reglas de ocultamiento

Crear `lib/binance/call-log.ts` con:

- Los tipos:
  - `BinanceApi = "rwa" | "trading" | "transaction" | "market" | "wallet"`.
  - `CallContext = { ticker?: string; amountUsd?: number; side?: "buy" | "sell"; wrapper?: WrapperId; purpose?: string; evaluationId?: string; referencePriceAt?: string; txHash?: string }`. Importar `WrapperId` de `lib/evaluate.ts`; no redefinirlo.
  - `CallLogEntry` con exactamente los campos de la tabla «Qué anota cada línea».
- `redactParams(params)`: devuelve una copia donde todo campo cuyo nombre termine en `key`, `secret`, `sign`, `signature`, `token` o `password` (sin distinguir mayúsculas) vale `"[oculto]"`. Se mira el final del nombre: `keyword` y `tokenContractAddress` se anotan. Recorre objetos anidados. No modifica el original.
- `truncateResponse(body)`: si el texto pasa los 20 KB (20 × 1024 bytes en UTF-8), lo corta y devuelve `{ body, truncated: true }`. Si no, `{ body, truncated: false }`. Si el texto es JSON válido y no se cortó, guardarlo como objeto, con los campos secretos ocultos con la misma regla que `redactParams`; si no, como texto.
- `newEvaluationId()`: devuelve `crypto.randomUUID()` (de `node:crypto`). Sin dependencias nuevas.
- `resolveCaller()` y `resolveEnv()`: leen `STOCKPROOF_CALLER` y `STOCKPROOF_ENV`. Si faltan o están vacíos, devuelven `"desconocido"`.
- `logFilePath(caller)`: `<dir>/binance-calls-<caller>.jsonl`, donde `<dir>` es `STOCKPROOF_LOG_DIR` o, si falta, `logs/` relativo a `process.cwd()`. Antes de armar el nombre, limpiar `caller` para que solo tenga `a-z`, `0-9` y `-` (evita escribir fuera de la carpeta).
- `writeCallLog(entry)`: crea la carpeta si no existe y agrega una línea (`JSON.stringify(entry) + "\n"`) con `appendFile` de `node:fs/promises`. **Nunca lanza**: si algo falla, escribe un `console.warn` corto y sigue.

### Paso 3: la puerta

Crear `lib/binance/request.ts` con:

```ts
export type BinanceRequest = {
  api: BinanceApi;
  url: string;               // URL completa
  method?: string;           // por defecto "GET"
  params?: Record<string, unknown>;  // lo que se manda, solo para el registro
  body?: BodyInit;
  headers?: HeadersInit;     // acá viaja la key; nunca se anota
  context?: CallContext;
};

export async function binanceRequest(req: BinanceRequest): Promise<Response>
```

Comportamiento:

1. Toma la hora (`ts`) y arranca el cronómetro con `performance.now()`.
2. Llama a `fetch(req.url, { method, headers, body })`.
3. **Si `fetch` responde** (cualquier código HTTP, incluido 4xx y 5xx): lee el cuerpo del clon con `readForLog`: como máximo 20 KB y un byte, y cancela el resto; si el cuerpo tarda más de 5 segundos, la línea queda sin cuerpo. Así una respuesta enorme o que no termina no bloquea la puerta, y la original queda entera para quien llamó. Después arma la línea con `ok = response.ok`, `status = response.status`, `error = null` si salió bien o `"HTTP <status>"` si no. Espera a `writeCallLog`. Devuelve **la `Response` original**, sin tocar.
4. **Si `fetch` lanza** (red caída, DNS, timeout): arma la línea con `status: null`, `ok: false`, `error: <mensaje>` y `response: null`. Espera a `writeCallLog`. Vuelve a lanzar **el mismo error**.
5. `endpoint` es el `pathname` de la URL, sin host ni query string. `params` pasa por `redactParams`. Los headers no se guardan nunca.
6. Si leer el clon falla, se anota `response: null` y la llamada sigue.

No agregar reintentos, caché ni lógica de Binance. La puerta no sabe qué endpoints existen.

### Paso 4: variables de entorno

Agregar a `.env.example`, con un comentario corto en castellano cada una:

```
# Quién llama: lautaro, agustin, luciano, demo o test. Sin esto, el registro dice "desconocido".
STOCKPROOF_CALLER=
# Desde dónde: local o ci.
STOCKPROOF_ENV=local
# Carpeta del registro de llamadas. Por defecto, logs/.
# STOCKPROOF_LOG_DIR=logs
```

No tocar el `.env` real.

### Paso 5: tests

Crear `tests/binance-request.test.ts` con Vitest. Sustituir `fetch` con `vi.stubGlobal` y apuntar `STOCKPROOF_LOG_DIR` a una carpeta temporal nueva por test (`fs.mkdtemp` en `os.tmpdir()`). Nunca llamar a Binance de verdad. Un test por criterio de aceptación:

1. Llamada que sale bien: una línea con todos los campos; la `Response` devuelta es la misma que dio el doble.
2. Error HTTP (por ejemplo 429): línea con `ok: false`, `status: 429` y `error`; quien llama recibe la `Response` con 429.
3. Falla de red: `fetch` lanza; línea con `status: null`; `binanceRequest` lanza el mismo error.
4. Secretos: mandar `headers: { "X-API-KEY": "clave-secreta" }` y `params: { signature: "firma-secreta", apiKey: "clave-secreta" }`; leer el archivo y comprobar que no contiene `clave-secreta` ni `firma-secreta`.
5. Registro que no se puede escribir: `STOCKPROOF_LOG_DIR` apuntando a un archivo común (no una carpeta); la llamada devuelve la respuesta igual.
6. Sin `STOCKPROOF_CALLER`: la línea dice `caller: "desconocido"` y está en `binance-calls-desconocido.jsonl`.
7. Dos llamadas seguidas: dos líneas, en orden, cada una JSON válido.
8. Respuesta de más de 20 KB: se guarda cortada y con `truncated: true`.
9. Respuesta que no es JSON: se guarda como texto.
10. Tres llamadas (una por wrapper) con el mismo `evaluationId`, una con `referencePriceAt` y otra con `txHash`: las tres líneas tienen el mismo `evaluationId` y los otros dos campos aparecen tal cual se pasaron.
11. `newEvaluationId()` llamado dos veces devuelve dos valores distintos.

Restaurar variables de entorno y `fetch` después de cada test.

### Paso 6: cierre

1. `npm run check` en verde. Si algo falla, arreglarlo; no desactivar reglas ni saltear tests.
2. Tildar en `progress/current.md` los criterios que se cumplen y escribir el «Último resumen».
3. Verificar que ningún archivo fuera de `lib/binance/request.ts` llame a Binance directamente (hoy no hay ninguno; dejarlo dicho en el resumen).
4. Commits chicos, en castellano. Abrir un pull request contra `develop` con Agustín como revisor. **No hacer push ni abrir el PR sin que Lautaro lo pida** (`AGENTS.md`).
5. La tarea no está terminada hasta que Agustín escriba su aprobación en la sección «Revisión» de `progress/current.md`.

### Qué no hacer

- No instalar dependencias.
- No cambiar `lib/evaluate.ts`, la pantalla ni `lib/evaluation-examples.ts`.
- No escribir el cliente de Binance ni endpoints reales: es tarea de Agustín.
- No crear archivos en `logs/` durante los tests.
- No escribir el Developer Experience Report ni el script que lo resume.

### Después del merge (lo hace Lautaro, no el agente)

- Pasar el ADR 0001 a `Estado: aceptado`.
- Agregar una línea con fecha al final de «Estado» en el Índice del vault, apuntando a la spec y al ADR.
- Pedirle a cada uno que ponga `STOCKPROOF_CALLER` en su `.env`.
- Avisarle a Agustín que su cliente pase `evaluationId` en las tres cotizaciones de cada evaluación y en la venta del mismo monto, `referencePriceAt` cuando lea el precio de referencia, y `txHash` cuando firme.

## Checklist de la skill write-spec

- [x] Problema y contexto claros para alguien que no conoce la feature.
- [x] Cada criterio de aceptación tiene su forma de verificación.
- [x] Casos borde listados (no solo el camino feliz).
- [x] Fuera de alcance explícito (qué NO incluye).
- [x] Decisiones técnicas con su motivo.
