# Tarea: medición propia de la dispersión entre pools

- Estado: terminada (revisor aprobó en la segunda revisión, 7 oct 2026). Falta la corrida larga de 48 a 72 h.
- Spec: specs/medicion-pools.md (Estado: aprobada, Agustín, 7 oct 2026)
- Rama: `feat/medicion-pools`, desde `main` (`5fa93ec`, después de #50)
- Issue: #13 (precio por pool). Esta tarea solo mide; conectar la pregunta 4 va después.
- Criterios de aceptación: ver la spec.
- Plan: adaptador de `trades` en `lib/binance/` + precio de pool en `lib/chain/` con tests → script `scripts/medir-pools.ts` y `npm run medir:pools` → corrida corta real de 10 minutos → check → revisor → dejarlo corriendo 48 a 72 h con `nohup`.

## Qué se hizo

- `lib/binance/market.ts`: `getTrades` (con `cursor` opcional; devuelve `{ trades, cursor }`) y `getTopLiquidity` por `binanceRequest` (`api: "market"`), firmados con `/build`. `parseTrades` saca el monto del token de `changedTokenInfo` (contrato sin mayúsculas) y descarta fills rotos; `fillUsdPrice = volume / monto`. HTTP 429 o `code 100004` → `rate-limited` con `retry-after`.
- `lib/chain/pool-price.ts`: `priceFromSqrtPriceX96`, `priceFromReserves` y `readPoolPrices` (batch JSON-RPC de `slot0`/`getReserves`/`token0`/`token1`, después `decimals`), en tandas de 20 llamadas.
- `lib/medicion/rate-guard.ts`: ≥ 500 ms entre llamadas firmadas, espera `retry-after` (60 s si falta) y reintenta una vez, corta con `RateLimitExceeded` al tercer límite seguido.
- `lib/medicion/pools.ts`: `measureRound` (fills cada ronda, paginando hasta el último fill visto o 5 min en la primera, tope 10 páginas → `tradesTruncated`; pools cada 12 rondas), `selectTokens`, `isReadablePool`. `lib/medicion/config.ts`: opciones, carpetas obligatorias y fuera del repo.
- `scripts/medir-pools.ts` + `npm run medir:pools` (vite-node con el alias `@/`). Fuerza `STOCKPROOF_CALLER=medicion`, `context.purpose = "medicion-pools"`; código 2 si corta por límite.
- Tests: `tests/market.test.ts`, `tests/pool-price.test.ts`, `tests/medicion.test.ts`, con fixtures reales del 7 oct 2026 en `tests/fixtures/market/` y lecturas reales de RPC.

## Verificación

- `npx -y -p node@20 npm run check` → 0: lint y tsc limpios, 272/272 unitarios, 25/25 e2e. (Una pasada con la medición corriendo en paralelo tuvo 6 e2e con timeout en el arranque en frío; repetida sin carga, verde.)
- Sin carpetas o con `STOCKPROOF_LOG_DIR=./logs`, el script sale 1 y lo dice.
- Corrida real `--duracion 10m` con paginación (datos en `~/Escritorio/projects/hacka-bnb/mediciones/`): 2 rondas × 12 líneas, 0 errores, 0 truncadas, 16 páginas por ronda, 50 llamadas en el registro externo. La ronda 1 se solapa con la 0 en QQQB/SPCXB/NVDAB: sin hueco. `git status` sin archivos nuevos fuera del cambio.
- Primera revisión: rechazada (100 fills por ronda no cubrían 5 minutos en bStocks). Agustín aprobó paginar con tope 10 y los arreglos menores; segunda revisión: aprobada.

## Notas

- Límite de la key medido el 7 oct 2026: `x-oc-ratelimit-limit = 5` por ventana de alrededor de 1 s; `trades` pesa 1. Agustín confirmó que la Market API no dice nada de cobro.
- `top-liquidity` y `trades` piden `binanceChainId`; con `chainId` responden `40001`. `trades` devuelve `data: { cursor, trades }`.
- Bug encontrado en la primera corrida real: el nodo público de BSC rechaza entero un batch de 40 `eth_call` («batch triggered rate limit»); con 30 responde. Los pools de bStocks (15 pools × 4 llamadas) quedaban todos `unavailable`. Se parte en tandas de 20 y hay test de regresión. Los datos de esa corrida quedaron aparte en `mediciones/descartado-bug-batch/`.
- Hallazgo: en BSC, Ondo y xStocks solo cotizan por RFQ (Bebop, Native, xChange), sin pool AMM ni liquidez publicada: para ellos solo hay fills. bStocks tiene pools V3 y V2 legibles (NVDAB/USDT: 237,74 vs 239,12 entre pools en la ronda 0).
- La laptop se suspendió durante la segunda corrida (21:17 a 22:32): el script terminó sin rellenar el hueco, como dice la spec. Para las 72 h hay que correrlo con `systemd-inhibit --what=sleep:idle` además de `nohup`.
- El `.env` con la key está solo en `~/Escritorio/projects/hacka-bnb/stock-proof/.env`; los worktrees no tienen uno. El script lo carga con `--env <ruta>`.
- La tarea anterior (#3) quedó en `progress/history/2026-10-07-estructura-preguntas.md`. Ya está en `main` (#49).

## Revisión

- **Veredicto: Rechazado.** El código cumple la letra de la spec y el check está en verde, pero con los datos de la corrida real la medición no sirve para elegir la ventana de 1 o 5 minutos en los bStocks más activos (ver hallazgo bloqueante). Hay que cambiar la spec antes de largar las 72 h.
- Revisor: revisor general (agente, Cursor), 2026-10-07. Cambios sin commitear en `feat/medicion-pools` sobre `origin/main`.

### Comandos corridos

- `git status` / `git diff origin/main --stat`: `package.json` (+1 script `medir:pools`), `git mv` de `progress/current.md` a `progress/history/2026-10-07-estructura-preguntas.md` (100 % igual) y los archivos nuevos listados arriba. Son unas 1.330 líneas: 797 de código (`market.ts` 211, `pool-price.ts` 202, `medicion/*` 293, script 91) y 532 de tests, más los fixtures. Es una sola unidad (la que define la spec), así que se revisa igual.
- `npx -y -p node@20 npm run check` → salida **0**: eslint y tsc limpios, **264/264** unitarios (22 archivos), **25/25** e2e.
- Mutaciones temporales (copia en `/tmp/rev-bak`, restauradas con `cp` y verificadas con `sha256sum -c`: `rate-guard.ts`, `config.ts`, `pools.ts`, `market.ts` y `pool-price.ts` dan `OK`). Cada una con `vitest run tests/{market,pool-price,medicion}.test.ts` bajo Node 20:
  - `lib/medicion/rate-guard.ts:9` `MIN_GAP_MS` 500 → 400 → **1 falla** («nunca deja menos de 500 ms…»).
  - `rate-guard.ts:11` `MAX_CONSECUTIVE_LIMITS` 3 → 4 → **1 falla** («…al tercer límite seguido lanza»).
  - `rate-guard.ts:10` `DEFAULT_RETRY_MS` 60 s → 30 s → **1 falla**. Sin reintento (`rate-guard.ts:55` devuelve `first`) → **3 fallan**.
  - `lib/binance/market.ts:98` contrato sin `toLowerCase` → **1 falla** («…aunque el contrato venga en mayúsculas»). Monto `>= 0` (`:196`) → **1 falla**. Precio invertido (`:125`) → **2 fallan**. HTTP 429 ignorado (`:173`) → **1 falla**.
  - `lib/chain/pool-price.ts:47` `tokenIsToken0` invertido en V3 → **4 fallan**; `:59` invertido en V2 → **3 fallan**; `:122` `token0`/`token1` cruzados → **2 fallan**; decimales al revés en V3 (`:48`) → **1 falla**.
  - `pool-price.ts:17` `MAX_BATCH` 20 → 1000 → **1 falla** (prueba de regresión del lote).
  - `lib/medicion/pools.ts:81` lee pools RFQ (sin `liquidityUsd !== null`) → **2 fallan**; pools en todas las rondas (`:94`) → **1 falla**. `lib/medicion/config.ts:84` acepta carpeta dentro del repo → **1 falla**.
  - **Sobreviven** (0 fallan): sacar `"100004"` de `market.ts:15`; `MAX_BATCH` 20 → 30; decimales al revés en V2 (`pool-price.ts:60`). Ver los hallazgos no bloqueantes.
- Corrida real (solo lectura de `~/Escritorio/projects/hacka-bnb/mediciones/`, sin llamar a Binance): la de 10 min de las 22:32 terminó sola. `pools-2026-10-08.jsonl` tiene ronda 0 (12 líneas, todas con pools) y ronda 1 (12 líneas, sin pools), 12 contratos distintos, 0 errores. En el registro externo hay 39 llamadas: todas `medicion/rwa|market/medicion-pools` y todas 200. El hueco mínimo entre dos `market` es de **499 ms**. Después de la corrida, `git status --porcelain --ignored` solo muestra los archivos del cambio, más `.next/`, `test-results/` y `tsconfig.tsbuildinfo`, que ya estaban ignorados.
- Script `node` de solo lectura sobre los fills (cuánto tiempo cubren los 100 de cada token y cuántos se repiten entre la ronda 0 y la 1): ver el hallazgo bloqueante.
- `check-map` → sale **1** («no hay docs/mapa-agentes.json»), igual que en las revisiones anteriores: es un hueco del repo, no de esta tarea.
- `rg` de `api_key|secret|password|PRIVATE|0x…{64}` sobre los archivos nuevos: los únicos resultados son `"private": true` de `package.json` y 8 `txHash` públicos en `tests/fixtures/market/trades-qqqb.json`. No hay `.env` en el worktree y no se tocó.

### Criterios verificados

- **Precio USD de un fill = `volume / cantidad del token`**, con el contrato comparado en minúsculas (`lib/binance/market.ts:98,103,123-126`). Se descartan los fills sin el token, con monto ≤ 0 o con números rotos (`:105-108,194-197`). Los tests usan la respuesta real de `trades` del 7 oct 2026 (`tests/market.test.ts:52-86`). El `price` de la API no se usa. Cumple.
- **Precio de pool V3 por `sqrtPriceX96` y V2 por reservas**, con decimales y con el token como `token0` y como `token1` (`lib/chain/pool-price.ts:39-61`). Los tests usan valores leídos el 7 oct (`tests/pool-price.test.ts:21-44`). Si `slot0` falla, se usa `getReserves`, y si fallan las dos queda `"unavailable"` (`pool-price.ts:129-138`; tests `:67-95,131-140`). Cumple.
- **Límite: espera `retry-after` o 60 s y reintenta una vez; corta al tercer límite seguido** (`lib/medicion/rate-guard.ts:34-57`; tests `tests/medicion.test.ts:50-96` con reloj simulado). HTTP 429 → `rate-limited` con el `retry-after` (`market.ts:173`; test `tests/market.test.ts:132-135` con `fetch` simulado). El script sale con código 2 ante `RateLimitExceeded` (`scripts/medir-pools.ts:70-72`). Cumple, salvo el código `100004` sin test (no bloqueante).
- **500 ms entre llamadas firmadas** (`rate-guard.ts:35-39`; test `tests/medicion.test.ts:33-48`). Cumple contra el reloj del guard; en el registro real hubo un hueco de 499 ms (no bloqueante).
- **Todo por `binanceRequest` con `caller: "medicion"`**: `market.ts:163-169` con `api: "market"`; `listStockTokens` y `getMarketStatus` ya pasaban por ahí (`lib/binance/rwa-public.ts:231`). El script fija `STOCKPROOF_CALLER` y `purpose` (`scripts/medir-pools.ts:28-29,37`). Lo prueban `tests/market.test.ts:105-130` y `tests/medicion.test.ts:226-233`, y lo confirma el registro real. Cumple.
- **Corrida corta real**: 12 tokens con líneas válidas y sin archivos nuevos en el repo (ver comandos). Cumple.
- **Casos borde**: los RFQ y los id de V4 de 32 bytes quedan con `price: null` (`lib/medicion/pools.ts:80-82,136-145`; tests `tests/market.test.ts:90-101`, `tests/medicion.test.ts:219-221`). Un error de un token queda en su línea (`pools.ts:110-123`; test `:203-234`). Sin carpetas, o con una carpeta dentro del repo, el script no arranca (`config.ts:80-88`; tests `:117-127`). Cumple.
- **`npx -p node@20 npm run check`** → 0. Cumple.

### Hallazgos bloqueantes

- **Con `limit=100` cada 5 minutos se pierde la mayoría de los fills de los bStocks activos, y la ventana de 5 minutos (y casi siempre la de 1) no se puede reconstruir.** El dato sale de las 3 rondas reales que hay en `pools-2026-10-08.jsonl`:

  | Token | Tiempo que cubren los 100 fills | Fills que se repiten entre la ronda 0 y la 1 |
  | --- | --- | --- |
  | QQQB | 0,6 a 2,1 min | 0 |
  | NVDAB | 2,1 a 2,8 min | 0 |
  | SPCXB | 2,0 a 4,4 min | 0 |
  | SPYB | unos 48 min | 89 |
  | Ondo y xStocks | horas | 98 a 100 |

  Con 0 fills repetidos entre rondas, entre el 50 % y más del 85 % de las operaciones de esos tres tokens no queda guardado. La spec justifica guardar datos crudos para «elegir después sin volver a medir» la ventana de 1 o 5 minutos (`specs/medicion-pools.md:66`). La tabla de contexto usa justamente «últimos 5 minutos» (`:18`). Con estos datos, para QQQB, el nombre líquido de referencia, esa medida no se puede calcular. El código hace lo que pide la spec (`lib/binance/market.ts:12,68`; `lib/medicion/pools.ts:17`): lo que falla es la spec, y conviene arreglarla antes de gastar 72 h de medición.
  - **Qué cambiar** (lo decide el usuario, porque cambia el presupuesto de llamadas de `specs/medicion-pools.md:37`): paginar `trades` con el `cursor` que ya devuelve la API (`data.cursor`, se ve en el fixture) hasta llegar al `time` más nuevo de la ronda anterior de ese token, con un tope de páginas. QQQB tiene unos 700 fills por cada 5 minutos, o sea unas 7 páginas. Con 3 tokens son unas 20 llamadas más por ronda, unas 250 por hora: siguen por debajo de 2 por segundo. La otra opción es bajar el intervalo solo para los tokens que llenan las 100 operaciones. Primero hay que confirmar que el endpoint acepta `cursor`. El cambio tiene que actualizar la spec (puntos 2 y 7), llevar un test de la paginación y su corte, y terminar con otra corrida corta.

### Hallazgos no bloqueantes

- El código de límite `100004` (`lib/binance/market.ts:15,185`) no tiene test: si se saca del set, no falla nada. Está en el punto 8 de la spec. Falta un caso `Response.json({ code: 100004 })` → `rate-limited` en `tests/market.test.ts`.
- El test del lote (`tests/pool-price.test.ts:127`) acepta hasta 30 llamadas, y la spec dice «hasta 20» (`specs/medicion-pools.md:33`). Con `MAX_BATCH = 30` el test sigue pasando. Si 20 es el margen elegido, conviene afirmar `≤ 20`.
- `priceFromReserves` no tiene un caso con decimales distintos (`lib/chain/pool-price.ts:60`). Si se invierten, el test no falla, porque todos los casos usan 18/18.
- En el registro real hubo dos llamadas `market` separadas por 499 ms. El guard mide desde que arranca el intento (`lib/medicion/rate-guard.ts:39`), antes de `sign` y de `binanceRequest`, así que la llamada sale hasta unos pocos ms más tarde. Frente al límite de 5 por segundo no importa, pero la spec dice «nunca a menos de 500 ms». Se arregla con unos ms de margen o ajustando el texto de la spec.
- Una ronda que lanza (`scripts/medir-pools.ts:74`) solo queda en la consola, no en el `.jsonl`. La spec pide que «la ronda que falla se anota con su error» (`specs/medicion-pools.md:50`). Con `nohup` queda en `nohup.out`; si se quiere el hueco en los datos, hay que escribir una línea de error con la hora de la ronda.
- El archivo del día se elige con `new Date()` después de la ronda (`scripts/medir-pools.ts:65`) y no con la hora de la ronda. Una ronda que cruza la medianoche UTC queda en el archivo del día siguiente. La hora de cada línea (`at`) sigue siendo la correcta.
- El código de salida 2 del script (`scripts/medir-pools.ts:70-72`) y que `measureRound` deje pasar `RateLimitExceeded` no tienen test propio. El guard sí está probado.
- `vite-node` (`package.json:14`) no está declarado: llega de forma transitiva desde `vitest` (3.2.4 en el lockfile). Si alguna vez `vitest` deja de traerlo, el script se rompe sin aviso.
- El diff, de unas 1.330 líneas, triplica la estimación de la spec (`specs/medicion-pools.md:78`, unas 450). Los casilleros de criterios de la spec siguen en `- [ ]`.
- Dato para el análisis, no para este código: hay fills con `dexName: ""` (3 de NVDAB en cada ronda) y pools de bStocks contra memecoins con precios de seis cifras en la contraparte (por ejemplo, SPYB a 42 M). `quoteAddress` permite filtrarlos.

### Segunda revisión

- **Veredicto: Aprobado.** La paginación con `cursor` cierra el hallazgo bloqueante: en la corrida real no queda hueco entre rondas. También quedan cerrados los hallazgos menores que Agustín aprobó corregir. Su aprobación (paginar con un tope de 10 páginas) está en `specs/medicion-pools.md:37,73`.
- Revisor: revisor general (agente, Cursor), 2026-10-07, 23:05. Mismos cambios sin commitear en `feat/medicion-pools`.

#### Comandos corridos

- `npx -y -p node@20 npm run check` → salida **0**: eslint y tsc limpios, **272/272** unitarios (22 archivos) y **25/25** e2e, en la primera pasada y sin otra carga.
- 15 mutaciones temporales (copia en `/tmp/rev-bak`, restauradas con `cp`; `sha256sum -c` da `OK` en `rate-guard.ts`, `config.ts`, `pools.ts`, `market.ts` y `pool-price.ts`). Cada una con `vitest run tests/{market,pool-price,medicion}.test.ts` bajo Node 20 (38 tests):
  - `lib/medicion/pools.ts:22` `MAX_TRADE_PAGES` 10 → 11 y 10 → 9 → **1 falla** en cada caso (tope de 10 páginas).
  - Primera ronda sin la ventana de 5 min (`:146` `?? roundStart`) → **3 fallan**. Si se ignora `lastSeenAt` (`:146`) → **1 falla**. Si no se actualiza `lastSeenAt` (`:169`) → **2 fallan**.
  - Si no se pasa el `cursor` (`:166`) → **1 falla**. Si se sigue sin `cursor` (`:162`) → **1 falla**. Si un error descarta lo leído (`:173`) → **1 falla**. `tradesTruncated` siempre `false` (`:175`) → **1 falla**.
  - `lib/binance/market.ts:81` sin `cursor` en la query firmada → **2 fallan**. `:15` sin `100004` → **1 falla** (el hueco de la primera revisión, cerrado).
  - `lib/chain/pool-price.ts:17` `MAX_BATCH` 20 → 21 → **1 falla** (el test ahora pide `≤ 20`). Decimales al revés en V2 (`:60`) → **1 falla** (caso nuevo de 18/6).
  - **Sobreviven** (0 fallan): `oldest <= target` → `<` (`pools.ts:162`) y `lastSeenAt` que puede retroceder (`pools.ts:170`, sin el `Math.max` con el valor anterior). Las dos son de borde, ver abajo.
- Corrida real (solo lectura de `~/Escritorio/projects/hacka-bnb/mediciones/`, sin llamar a Binance):
  - `pools-2026-10-08.jsonl` tiene 24 líneas: ronda 0 (02:00 UTC) y ronda 1 (02:05), 12 tokens distintos en cada una, 0 errores, 0 truncadas, 0 `roundError` y 16 páginas por ronda (QQQB 4, SPCXB 2, el resto 1).
  - QQQB cubre 7,2 min hacia atrás en la ronda 0, SPCXB 5,8 y NVDAB 6,9. Entre la ronda 0 y la 1 se repiten 22, 41 y 39 fills respectivamente, así que no hay hueco.
  - Las páginas de QQQB son contiguas y no se solapan (02:00:32–01:58:37 | 01:58:34–01:57:40 | 01:57:40–01:55:31 | 01:55:31–01:53:27). Hay 0 registros idénticos dentro de una ronda.
  - En el registro externo hay 50 llamadas, todas `medicion/{rwa,market}/medicion-pools` y todas 200. 8 llevan `cursor`. El hueco mínimo entre dos `market` es de 500 ms.
- `git status --porcelain --ignored` después de la corrida: solo los archivos del cambio y los ignorados de siempre (`.next/`, `test-results/`, `tsconfig.tsbuildinfo`).
- `check-map` → **1** («no hay docs/mapa-agentes.json»), igual que antes: hueco del repo.
- `rg` de `secret|password|PRIVATE|BEGIN` sobre los archivos del cambio → sin resultados. No hay `.env` en el worktree.

#### Criterios verificados

- **Paginación** (spec, punto 2): `fetchFills` (`lib/medicion/pools.ts:140-178`) pagina con `cursor` (`lib/binance/market.ts:71-87`, el cursor va firmado en la query). Corta al llegar al fill más nuevo visto del token, o a 5 minutos antes en la primera ronda (`pools.ts:146,162`). Tiene un tope de 10 páginas con `tradesTruncated` (`:22,153,175`). Un error a mitad de camino deja lo leído y el motivo (`:155-158,173,176`). Lo cubren 5 casos (`tests/medicion.test.ts:254-308`) más el del cursor (`tests/market.test.ts:132-145`).
- **Salida** (punto 5 y casos borde): el archivo del día sale de la hora de inicio de la ronda (`scripts/medir-pools.ts:58-59`). Si una ronda falla entera, escribe `{at, round, roundError}` (`:81-85`).
- **Freno** (punto 8): `100004` → `rate-limited` con `retry-after` (`market.ts:15`; test `tests/market.test.ts:147-150`).
- **Lote RPC ≤ 20** (punto 3): `tests/pool-price.test.ts:132`. **V2 con decimales distintos**: `tests/pool-price.test.ts:46-49`.
- Los criterios de la primera revisión siguen en pie: las mutaciones de esa ronda no se tocaron y el check está en verde.

#### Hallazgos bloqueantes

- Ninguno.

#### Hallazgos no bloqueantes

- `lib/medicion/pools.ts:162`: cambiar el borde `<=` por `<` no rompe ningún test. En la práctica solo cambia una página de más cuando el fill más viejo cae justo en `target`. Es inofensivo, pero si se quiere fijar, alcanza un caso con un fill en `time === target`.
- `lib/medicion/pools.ts:170`: si se saca el `Math.max` con el `lastSeenAt` anterior, ningún test falla. Solo pesa si una ronda trae únicamente fills más viejos que los ya vistos, lo que no debería pasar con una API ordenada.
- `lib/medicion/pools.ts:161-162`: si una página trae fills pero `parseTrades` los descarta todos, queda vacía y la paginación se corta como si no hubiera más (`reachedTarget = true`), aunque la API haya dado `cursor`. Es un caso raro y no está cubierto.
- `lib/medicion/pools.ts:146,169-171`: si la primera página de un token falla, `lastSeenAt` no cambia y la ronda siguiente pagina más atrás, hasta 10 páginas. Eso rellena parte del hueco, aunque la spec dice que los huecos «no se rellenan» (`specs/medicion-pools.md:52`). Es mejor para los datos; si se deja así, conviene que la spec lo diga.
- `scripts/medir-pools.ts:58-59,81-85`: el archivo por hora de inicio y la línea `roundError` no tienen test, porque el script no tiene unitarios. Se pueden leer en el código. Suma al test del exit 2, que tampoco está.
- Para el análisis de la tarea siguiente: el `txHash` se repite dentro de una ronda (QQQB, 148 de 400) porque una transacción trae varios fills. Para deduplicar el solape entre rondas no alcanza con `txHash`; hay que usar el registro completo (`txHash`, `time`, `tokenAmount`, contraparte).
- `progress/current.md`, en «Qué se hizo» y «Verificación» (`:10-23`), todavía describe la versión sin paginar (264 unitarios, corrida de 26 llamadas). Hay que actualizarlo al cerrar.
- Siguen sin atender, como decidió el líder: el hueco de 499 ms que mide el guard antes de firmar (`lib/medicion/rate-guard.ts:39`), el test del exit 2 (`scripts/medir-pools.ts:77-80`), `vite-node` transitivo (`package.json:14`) y `check-map` en 1 por falta de `docs/mapa-agentes.json`.
