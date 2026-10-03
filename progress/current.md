# Tarea: Cableado de las preguntas 3 y 4 y Exit Now en `evaluate`

- Estado: terminada (spec aprobada por Agustín al pedir el merge, 3 oct 2026)
- Spec: specs/cableado-evaluate.md (Estado: aprobada; las dos preguntas abiertas quedan para otra tarea)
- Issue: N/A — sigue a #15, #16, #17 y #18, ya cerradas. Esas tareas dejaron las piezas sueltas; esta las conecta a `evaluate` y al orquestador.
- Rama: `feat/cableado-evaluate`, rebasada sobre `main` (`8c0860a`, después de #43)
- Criterios de aceptación (de la spec):
  - [x] Venta medida sobre el tope en todos los candidatos: `cut` de la pregunta 2 con `EXIT_OVER_LIMIT` y `exits` (unitario).
  - [x] Ninguna venta medida: `unavailable` de la pregunta 2 con `EXIT_NOW_UNAVAILABLE` (unitario).
  - [x] Gana el siguiente firmable y el empate solo cuenta entre firmables (unitario).
  - [x] Pregunta 3 sobre el ganador: corta con el candidato o queda «sin dato» (unitario).
  - [x] Pregunta 4: `POOLS_DISAGREE` corta; régimen ausente no corta (unitario).
  - [x] Venta con el `toTokenAmount` exacto y la wallet del agente; una falla no tumba al resto; `market/status` se lee una vez (unitario).
  - [x] `toTokenAmount` exacto por encima de 2^53 (unitario).
  - [x] Columna «Salida ahora» y corte por la venta en pantalla, sin firma (e2e).
  - [x] `npm run check` en verde (con Node 20, como CI).
- Plan: rebase sobre #43 → resolver la tabla de cotizaciones (huecos de #43 + columna de salida) → ajustar el e2e que contaba celdas con «US$» → e2e de la escena `cutExitNow` → spec propia → `check` → revisión → PR.
- Decisiones:
  - La salida viaja por wrapper (`exits`); el `exit` del `pass` es el del ganador. Motivo y alternativa en la spec.
  - Las preguntas 3 y 4 corren solo sobre el ganador de la 2: no se cambia de wrapper en silencio (regla del vault, 30 sep 2026).
  - Venta sin medir es `unavailable`, no `cut`: no se inventa el dato, y tampoco se firma.
- Notas:
  - Rebase: un solo conflicto, en `components/evaluation-result.tsx` (`QuotesTable` y `QuoteGaps`). Se quedaron los dos lados.
  - El e2e de la pregunta 2 de #43 contaba tres celdas con «US$»; con la columna de salida son cinco. Ahora cuenta filas y verifica la columna.
  - `tests/format.test.ts` falla en `main` con Node 24 (ICU pone un espacio no separable en «p. m.»). Con Node 20, que es el de CI, pasa. No es de esta tarea.
  - PR #44 (abierto) toca `lib/evaluation-input.ts`, la pantalla, `messages.ts` y `progress/`. El que se una segundo se rebasa. #44 ya archiva la tarea de la pantalla en `progress/history/2026-10-02-pantalla-landing.md`; acá no se duplica para no chocar.
  - Pregunta abierta 1 de la spec: fuera de rueda Binance manda el subyacente en `null`, así que en vivo un sábado no se firma nada (ni QQQB). Choca con la escena del vault.

## Revisión

**Veredicto: Aprobado.** Revisor: revisor general (harness, Cursor), 2026-10-03, sobre `feat/cableado-evaluate` (`207bf99` + `cb71e7c`, working tree limpio antes de esta sección).

Condición para unir (no es del código): la spec queda en `borrador` y se aprueba en el PR; Agustín tiene que responder ahí sus dos preguntas abiertas (fuera de rueda no se firma nada, ni QQQB; «el monto que sí se puede vender» va aparte). Las dos chocan con escenas del vault (`Diferenciador.md:50` y `:65`), así que no las decide el revisor.

### Comandos corridos

- `git log --oneline origin/main..HEAD`, `git diff --stat origin/main` y `git diff origin/main` de los 18 archivos.
- `npm run check` con Node `v20.20.2` (el de CI) — **en verde**: eslint limpio, `tsc --noEmit` limpio, **191 unitarios** (14 archivos) y **10 e2e** de Playwright.
- `python3 ~/.agents/skills/check-map/check_map.py $(git diff --name-only origin/main)` — sale **`1`**: «no hay docs/mapa-agentes.json». No es `2` (no hay coincidencia sensible declarada), pero tampoco es «todo bien»: el repo no tiene mapa, ni en `main`. Ver hallazgos.
- Script descartable fuera del repo (`vite-node` en `/tmp`, borrado) sobre `evaluate` para los casos borde de la spec que no tienen unitario: `now` con `recoveredUsd: NaN` → `unavailable` `EXIT_NOW_UNAVAILABLE`; `now` sin `simulatedAt` → igual; `exits` con bStocks repetido (primero 0,5, después 0,001) y un wrapper desconocido → vale la primera entrada, se ignora el desconocido y gana Ondo; `referenceUsd: null` → `unavailable` de la pregunta 3 `REFERENCE_PRICE_UNAVAILABLE`.
- Búsqueda de secretos en el diff: solo aparecen nombres de variables en líneas de contexto de `specs/conexion-datos.md` (ya estaban en `main`). Sin `.env` tocado, sin push.

### Criterios verificados contra código

- Compuerta doble de la pregunta 2 (`lib/evaluate.ts:336-378`): sin compra bajo el tope → `IMPACT_OVER_LIMIT` (`:337-346`); firmable = compra **y** `exits[].now.costRatio` ≤ `IMPACT_LIMIT` (`:350-353`); si ninguna firma y alguna venta se midió sobre el tope → `cut` `EXIT_OVER_LIMIT` (`:356-369`); si ninguna venta se midió → `unavailable` `EXIT_NOW_UNAVAILABLE` (`:370-377`). Venta ausente o malformada nunca firma (fail closed).
- Ganador entre firmables (`lib/evaluate.ts:380-384`, `tied` en `:465`): menor impacto de compra entre `signable`, desempate por `WRAPPERS`, empate medido solo entre firmables. Coincide con la regla del vault (`Idea.md:45`: «se firma la que tiene compra y venta bajo el tope; si hay más de una, la de menor impacto de compra»).
- Pregunta 3 solo sobre el ganador (`lib/evaluate.ts:391-427`) con `decideQuestion3`: corte con `wrapper` y `address` del candidato; precio faltante → `unavailable`. No prueba con el siguiente wrapper (no se cambia en silencio).
- Pregunta 4 (`lib/evaluate.ts:429-448`): solo `POOLS_DISAGREE` corta; régimen ausente usa `EMPTY_REGIME` y no corta.
- `pass` (`lib/evaluate.ts:450-456`): `exit.now` y `exit.availability` son los del ganador; `risk: "unavailable"` (issue #19). `exits` viaja en `pass`, en los `cut` 2/3/4 y en los `unavailable` posteriores a la cotización.
- Casos borde de `exits` (`lib/evaluate.ts:522-555`): wrapper desconocido o repetido se ignora (vale el primero); `now` no finito o sin `simulatedAt` cuenta como no medido.
- Orquestador (`lib/evaluation-input.ts:242-307`): la venta se pide solo si la compra llegó, en paralelo con la pregunta 1, la disponibilidad y `dynamic` (`:261-276`), con `amount: quote.toTokenAmount` y la wallet del agente (`:267-272`); cada fuente tiene `.catch` → `"unavailable"`. `market/status` memoizado en una sola promesa (`:170-175`). La entrada ya no tiene `exit` global; suma `exits` y `reference` (`:120-129`).
- `toTokenAmount` como cadena exacta (`lib/binance/trading.ts:134-146`): la cadena viaja tal cual; `toAmount` sigue siendo número para no romper a los consumidores.
- Pantalla: la columna «Salida ahora» aparece solo cuando hay `exits` y muestra «sin dato» si la venta no se midió (`components/evaluation-result.tsx:281-310`); los cortes 3 y 4 nombran al «Emisor candidato» (`:171-186`); el `unavailable` muestra la referencia y la tabla (`:135-140`). La pantalla solo lee, no vuelve a decidir el corte. Textos nuevos en `components/messages.ts:31-38`; escena `cutExitNow` (`lib/evaluation-examples.ts:128-136`, `components/stock-proof-screen.tsx:29-32`).
- Arquitectura: decide `lib/evaluate.ts`; el orquestador traduce y declara `"unavailable"`; la key sigue solo en el servidor (`evaluation-examples.ts` importa funciones puras). Sin cambios fuera de alcance.
- Specs hermanas coherentes con el código: `formato-evaluacion.md` (entrada `exits`, `exit` del ganador), `preguntas-1-y-2.md` («entra y sale», tabla de resultados, casos borde), `conexion-datos.md` (puntos 5-7 del orquestador), `cotizaciones-parciales.md` (ganador entre firmables).

### Tests revisados — verifican comportamiento real

- `tests/evaluate.test.ts`: compra y venta en el 1% exacto pasan; el de menor compra que no puede salir cede al siguiente; el empate excluye a un wrapper cuya venta no pasa; `EXIT_OVER_LIMIT` con su `costRatio` en `exits`; la venta medida sobre el tope pesa más que el «sin cotización» de otro wrapper; sin `exits` no se firma; pregunta 3 (retorno total de Ondo, multiplicador, desvío sin causa con candidato, precio faltante); pregunta 4 (libro clavado pasa y queda en el régimen, `POOLS_DISAGREE` corta, sin pools no corta); la disponibilidad del ganador llega al bloque de salida; las escenas de la pantalla salen de `evaluate`, `cutExitNow` incluida.
- `tests/evaluation-input.test.ts`: `amount` de la venta igual al `toTokenAmount` exacto de cada compra, con el contrato y la wallet `0xAGENTE`; ni `NOT_LISTED` ni `NO_QUOTE` piden venta; venta `"unavailable"` en un wrapper sin tumbar al resto; `marketStatus` llamado una sola vez (`toHaveBeenCalledTimes(1)`) con la disponibilidad real; precios crudos por wrapper; subyacente `null` entra crudo.
- `tests/trading.test.ts`: `toTokenAmount` por encima de 2^53 se conserva y el test demuestra que `Number` lo habría perdido.
- `e2e/pantalla.spec.ts`: el corte de la pregunta 2 cuenta filas (no celdas con «US$») y comprueba la columna «Salida ahora» con valor y con «sin dato»; la escena `cutExitNow` muestra el motivo, US$ 1.952 en bStocks y no muestra el botón de firma.

### Hallazgos menores (no bloqueantes)

- **`check-map` sale `1`**: falta `docs/mapa-agentes.json`, también en `main`; ninguna revisión anterior lo corrió. Sin mapa no se puede saber si `lib/binance/trading.ts` (cotización firmada) o `lib/evaluate.ts` son rutas sensibles. No se rechaza porque no hay coincidencia `2` y es un hueco del repo, no de esta tarea. Conviene abrir un issue con `crear-issue` para crear el mapa.
- **Faltan unitarios de los casos borde de `exits`** (spec, «Casos borde»): `now` malformado, wrapper repetido o desconocido. Los comprobé con el script de arriba y el código cumple, pero son la compuerta: merecen un test en `tests/evaluate.test.ts`.
- **No hay test de una venta que lanza excepción** (`lib/evaluation-input.ts:273`, `.catch`): el test cubre `exitNow` devolviendo `"unavailable"`, no rechazando.
- **`toTokenAmount` no se valida como entero** (`lib/binance/trading.ts:134-138`): una cadena decimal (el fixture `"0.87"` de `tests/trading.test.ts:50` lo muestra) o un número grande pasado por `toString()` (`"1.99e+20"`) se mandaría tal cual como `amount` de la venta. Hoy termina en fail closed (la API no cotiza → «sin dato»), pero un `/^\d+$/` haría que la compra no sirva si su salida no es medible.
- **El `unavailable` de la pregunta 3 no nombra al candidato** (`lib/evaluate.ts:417-426`): la spec lo exige solo para los cortes, pero el usuario no sabe sobre qué emisor faltó el precio.
- **Tamaño (~1.300 líneas: 550 de `lib`+`components`, 591 de tests+e2e, el resto specs y progress)**: la justificación de no partir es razonable para la unión `Evaluation`, pero no del todo exacta: un primer slice «compuerta de la venta + orquestador» no dejaba `main` peor que hoy; lo que no se podía era unir las preguntas 3 y 4 antes que la compuerta. Se acepta porque el código de producción ronda las 550 líneas, más de la mitad del diff son tests y el cambio es una sola unidad coherente.

### Después de la aprobación (líder, 2026-10-03)

- Se sumaron los tests que pedían dos hallazgos, sin tocar código de producción: venta malformada que no firma, wrapper repetido (vale la primera) y desconocido (se ignora) en `tests/evaluate.test.ts`, y venta que lanza error sin tumbar al resto en `tests/evaluation-input.test.ts`.
- `npm run check` con Node 20 sigue en verde: **194 unitarios** y **10 e2e**.
- Quedan para otra tarea: validar `toTokenAmount` como entero (romper el fixture `"0.87"` pide revisar los tests de `trading`), nombrar al candidato en el `unavailable` de la pregunta 3 y crear `docs/mapa-agentes.json`.
