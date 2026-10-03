# Tarea: Textos de motivo y frase de tope

- Estado: terminada (revisor aprobó en la segunda vuelta, 3 oct 2026)
- Spec: specs/textos-motivo-y-frase.md (Estado: en implementación — Luciano aprobó el alcance el 2 oct 2026)
- Rama: `feat/textos-y-frase`, rebasada sobre `main` (`2e05e8b`, después de #45)
- Issues: #21 y #23. #11 y #20 no se rehacen: se confirman en el tablero.
- Criterios de aceptación (de la spec):
  - [x] `reasonText` cubre los códigos de las preguntas 3 y 4, sin mostrar el código.
  - [x] `signalText` traduce `POOL_DISPERSION` y `OFF_HOURS_WEEKEND` (unitario). En las escenas que pasan, `salida-riesgo` dice «sin dato» sin código crudo (e2e).
  - [x] La oración pide el contrato real y un tope. Un tope inválido no evalúa. En vivo, el tope viaja con punto decimal y no viaja si está vacío (e2e con la ruta interceptada).
  - [x] `passTopeFrase` muestra «Se puede firmar» y «tope de impacto», con la firma deshabilitada.
  - [x] `buildEvaluateInput` reenvía el tope solo si es un número finito mayor a cero, y no lo inventa (unitario).
  - [x] La ruta convierte `maxImpactPercent` a fracción y omite el inválido sin responder 400 (unitario `tests/evaluate-route.test.ts`).
  - [x] Un tope igual al impacto ganador no se viola (unitario).
  - [x] `npm run check` en verde (3 oct 2026, Node 20: eslint, tsc, 214 unitarios, 15 e2e).
- Revisión: ver abajo.
- Plan: frases en `messages.ts` → señales sin código crudo → tope de la oración y reenvío en la ruta → ejemplo `passTopeFrase` → tests → `npm run check`.
- Decisiones:
  - La oración dice «no supera el», para coincidir con `impact > maxImpactRatio`. `evaluate` no se toca.
  - El cuerpo HTTP manda por ciento (`maxImpactPercent`). La entrada de `evaluate` recibe la fracción.
  - Las escenas de ejemplo ignoran el tope tipeado. La escena por defecto sigue siendo `pass`.
  - Un tope inválido en el POST se omite. La pantalla, en cambio, no evalúa.
- Notas:
  - La tarea anterior (`pantalla-landing`) quedó archivada en `progress/history/2026-10-02-pantalla-landing.md`. Ya está en `main`.
- Rebase sobre `main` con el cableado (#45, 3 oct 2026):
  - `messages.ts`: quedan las frases de la pregunta 3 de esta spec y se suman `EXIT_OVER_LIMIT` y `EXIT_NOW_UNAVAILABLE` del cableado.
  - `passTopeFrase` se reescribió con la entrada nueva (`exits` por emisor, precios crudos de la pregunta 3, `poolsDiffRatio`); sigue dando `violated: ["MAX_IMPACT_RATIO"]`.
  - `buildEvaluateInput` manda `exits` y además `constraints`; ya no existe el `exit: "unavailable"` global.
  - En el conflicto de `tests/evaluation-input.test.ts` no se conservó el unitario «reference y regime del token de bStocks»: #45 ya lo había quitado de `main` porque probaba el formato viejo de `reference`.
  - `exit.risk` queda «sin dato» hasta la issue #19: los e2e de las escenas que pasan ahora esperan «sin dato» en `salida-riesgo`, sin código crudo. `signalText` sigue cubierto por `tests/messages.test.ts`. Spec actualizada.
  - La tarea del cableado quedó archivada en `progress/history/2026-10-03-cableado-evaluate.md`.

## Revisión

**Veredicto: Rechazado en la primera vuelta; aprobado en la segunda (ver abajo).** Revisor: revisor general estricto (harness, Cursor), 2026-10-03, sobre `feat/textos-y-frase` (`4f4b4b0` sobre `origin/main` `2e05e8b`, working tree limpio antes de esta sección).

El código cumple la spec y el `check` está en verde. Se rechaza por cobertura: la validación del cuerpo HTTP en el servidor (`maxImpactPercent`) no tiene ningún test, y tres bordes que la spec nombra no tienen test aunque los criterios dicen «(unitario)». Los cuatro arreglos son solo tests; no hace falta tocar código de producción.

### Comandos corridos

- `git log --oneline -3`, `git status --short` (limpio), `git diff --stat origin/main` (17 archivos, +455/−96) y `git diff origin/main` completo.
- `npm run check` con Node `v20.20.2` (el de CI) — **en verde**: eslint limpio, `tsc --noEmit` limpio, **200 unitarios** (15 archivos) y **13 e2e** de Playwright.
- `python3 ~/.agents/skills/check-map/check_map.py $(git diff --name-only origin/main)` — sale **`1`**: «no hay docs/mapa-agentes.json». No es `2`. Mismo hueco que en `main` (ya anotado en la revisión del cableado); no es de esta tarea.
- Rebase: `git range-diff 17d11b5~1..17d11b5 origin/main..HEAD`; `diff` de `progress/history/2026-10-03-cableado-evaluate.md` contra `origin/main:progress/current.md` (**idéntico**); `diff` de `progress/history/2026-10-02-pantalla-landing.md` y de la spec contra `17d11b5`. Las únicas líneas de `main` que el diff borra son las tres frases provisionales de la pregunta 3 (`messages.ts`), el `<code>` crudo de la señal y la frase vieja de la home: todas reemplazadas a propósito. No se perdió nada de #45 (`EXIT_OVER_LIMIT`, `EXIT_NOW_UNAVAILABLE`, `exits`, `reference` por emisor siguen) ni de #44 (frases, `signalText`, `phrase.ts`, ruta, pantalla, `passTopeFrase`, tests).
- `node -e` descartable para la frontera en punto flotante: `0.7/100 = 0.006999999999999999`, así que `0.007 > 0.7/100` es `true`. En vivo no muerde porque `lib/binance/trading.ts:144` también divide el porcentaje de la API por 100 (mismo float en las dos puntas), pero ningún test lo fija.
- Búsqueda de secretos en el diff (`api key|secret|private|BINANCE_`): solo una línea de contexto ya presente en `main`. Sin `.env` tocado, sin push ni deploy.

### Criterios verificados contra código

- Textos: frases de pase, corte y «sin dato» de la pregunta 3 y corte de la 4 en `components/messages.ts:33-43`, en tercera persona; las de `EXIT_*` del cableado se conservan (`:31-32`). `signalText` con genérico en `:46-54`; la pantalla ya no muestra `<code>` y la clave del `li` es `code-observedAt` (`components/evaluation-result.tsx:495-496`).
- Frase: «Comprame US$ [monto] de [ticker] si el contrato es el real y el costo no supera el [tope] %.» (`components/stock-proof-screen.tsx` en el `p.intent-sentence`), tope inicial `"1"`, mensaje propio «El tope tiene que ser un porcentaje mayor a cero y como máximo 100.» con `aria-describedby`.
- Orden de validación: ticker y monto primero (`stock-proof-screen.tsx:70-75`), después el tope (`:76-82`), después la escena (`:83-86`). Solo «En vivo» llega al `fetch`; `maxImpactPercent` va con punto decimal y solo si el tope no está vacío (`:97-99`).
- `impactRatioFromPercent` (`lib/phrase.ts:6-12`): vacío → `undefined`, inválido (≤ 0, > 100, no finito) → `null`, válido → fracción. Las dos puntas la usan (decisión técnica de la spec).
- Ruta (`app/api/evaluate/route.ts:30-35`, `:41-45`): `readImpactRatio` acepta string o number; inválido → `undefined` → se omite, sin 400; las cuatro preguntas corren igual.
- `buildEvaluateInput` (`lib/evaluation-input.ts:134`, `:138-145`): `constraints` solo con número finito > 0; si no vino, no aparece.
- `evaluate` sin cambios: la comparación sigue siendo `winner.impactRatio > constraints.maxImpactRatio` (`lib/evaluate.ts:603-608`); `lib/evaluate.ts` no está en el diff. La pantalla muestra `constraints` solo si `violated` no está vacío (`evaluation-result.tsx:224-228`), no decide el corte.
- `passTopeFrase` (`lib/evaluation-examples.ts:161-183`): sale de `evaluate` con la entrada nueva; impacto ganador 0,4 %, tope 0,3 %.
- Arquitectura: `lib/phrase.ts` es puro y no importa nada del servidor; la key sigue solo en la ruta. Sin cambios fuera de alcance (no hay `maxDeviationRatio` en la frase, la firma sigue deshabilitada, la escena por defecto sigue siendo `pass`).
- Spec: «en implementación (Luciano aprobó el alcance el 2 oct 2026)». Cuenta como aprobada para implementar: es una aprobación humana escrita del alcance, con el mismo formato que `specs/pantalla-landing.md` (ya en `main`). La aprobación final la da el PR (1 aprobación requerida). `progress/current.md:3` apunta a la spec.
- Tamaño: +455/−96, de los que ~150 son `progress/history` archivado y ~90 la spec. Código de producción ~160 líneas. Revisable de una sentada.

### Tests revisados

- `tests/phrase.test.ts`: vacío y espacios → `undefined`; «1», «0,5» (coma) y «100» → fracción; «0», «-1», «100.1», «abc», «NaN» → `null`. Comportamiento real, cubre los bordes de parseo.
- `tests/messages.test.ts:18-58`: todos los códigos de las listas `Q3_*` y `Q4_CUT_REASONS` tienen frase que no es el genérico ni contiene el código; `signalText` traduce las dos señales y un desconocido no sale crudo.
- `tests/evaluation-input.test.ts:256-268`: con `maxImpactRatio: 0.005` llega `constraints`; sin él, `constraints` es `undefined`.
- `tests/evaluate.test.ts:740-743`: `passTopeFrase` es `pass` con `violated` exactamente `["MAX_IMPACT_RATIO"]`.
- `e2e/pantalla.spec.ts:58-63` (frase y tope «1»), `:65-74` (tope «0» → mensaje y sin `resultado`; si faltara la validación, el clic pintaría el `pass` y el test fallaría), `:101-103` y `:245-247` (`salida-riesgo` dice «sin dato» y no muestra el código), `:250-259` (`passTopeFrase`: «Se puede firmar», «tope de impacto», firma deshabilitada).

### Hallazgos bloqueantes

1. **La validación del cuerpo HTTP no tiene test** (`app/api/evaluate/route.ts:30-35`, `:41-45`). La spec dice «Un tope inválido en el cuerpo se omite y las cuatro preguntas igual corren. No responde 400» (Comportamiento y Casos borde), y AGENTS.md pone esa validación en el servidor. No hay ningún test de la ruta. **Arreglo**: `tests/evaluate-route.test.ts` que haga `vi.mock("@/lib/evaluation-input")` (espiar `buildEvaluateInput`, `realInputDeps` como stub) y llame a `POST(new Request(..., { body }))`. Casos: `"0.5"` → `maxImpactRatio` 0.005; `0.5` numérico → 0.005; `"0"`, `"150"`, `"abc"`, `true`, `null` → la request a `buildEvaluateInput` no trae `maxImpactRatio`, la respuesta es 200 y viene la `Evaluation`; sin el campo → tampoco.
2. **La frontera «tope igual al impacto no viola» no tiene test** (spec, Contexto y Casos borde; es la razón de escribir «no supera el»). `tests/evaluate.test.ts:697-716` solo prueba una violación (0,1 % contra 0,2 %). **Arreglo**: un unitario en `tests/evaluate.test.ts` donde el ganador impacta igual al tope y `constraints.violated` queda `[]`. Que el tope salga de `impactRatioFromPercent("0,7")` y el impacto sea `0.7 / 100` (como en `lib/binance/trading.ts:144`), para fijar que el punto flotante no convierte el «igual» en violación.
3. **El criterio «`buildEvaluateInput` reenvía `maxImpactRatio` solo si vino un número finito mayor a cero (unitario)» está a medias** (`tests/evaluation-input.test.ts:256-268`). Prueba un positivo y el ausente, no el «solo si». La guarda de `lib/evaluation-input.ts:141` no tiene test. **Arreglo**: en el mismo `it`, `0`, `-0.01`, `NaN` e `Infinity` → `constraints` `undefined`.
4. **El contrato de la pantalla con la ruta no tiene test** (`components/stock-proof-screen.tsx:97-99`). La spec dice «el texto escrito, con punto decimal» y «Tope vacío en vivo: no se manda `maxImpactPercent`». **Arreglo**: un e2e con `page.route("**/api/evaluate", ...)` en la escena «En vivo» que capture `request.postDataJSON()` y responda un `Evaluation` de ejemplo: con «0,5» el cuerpo trae `maxImpactPercent: "0.5"`; con el tope vacío, el cuerpo no trae la clave. Sin red real.

### Hallazgos no bloqueantes

- **`progress/` y la spec quedaron con datos de antes del rebase**: `progress/current.md:4` dice «sobre `main` (`8c0860a`)» (ahora es `2e05e8b`); `progress/current.md:13`, `specs/textos-motivo-y-frase.md:62` y el cuerpo del PR dicen «179 unitarios, 12 e2e» (ahora 200 y 13). `progress/current.md:9` todavía dice que el e2e «lo ve en `salida-riesgo`», cuando ahora ve «sin dato». Corregir al sumar los tests.
- **La nota del rebase atribuye mal un test**: «Se quitó el unitario "reference y regime…"» (`progress/current.md:27`). Ese test ya no existe en `origin/main`: lo sacó #45, no este rebase. No cambia nada del código; corregir la frase para que nadie lo busque en este diff.
- **`Number()` acepta formatos raros** (`lib/phrase.ts:9`): «0x10» da 16 % y «1e1» da 10 %. No rompe nada (sigue en (0, 100]), pero una regex `^\d+([.,]\d+)?$` dejaría la frase en «porcentaje escrito por una persona». Se puede hacer en otra tarea.
- **Un tope inválido también bloquea las escenas de ejemplo** (`stock-proof-screen.tsx:76-86`), aunque la spec dice que las escenas ignoran el tope tipeado. Es coherente con «Inválido: la pantalla no evalúa», pero conviene dejarlo escrito en la spec para que no se lea como contradicción.
- **El criterio de señales dice «las dos escenas que pasan»** (`specs/textos-motivo-y-frase.md:58`): ahora son tres (`passTopeFrase`). Opcional sumar la aserción ahí también.
- **`check-map` sale `1`** (falta `docs/mapa-agentes.json`, también en `main`). Ya está como pendiente en la revisión del cableado; no se exige acá.

### Segunda vuelta (2026-10-03)

**Veredicto: Aprobado.** Revisor: revisor general estricto (harness, Cursor), sobre `feat/textos-y-frase` (`4f4b4b0` + cambios sin commitear: `tests/evaluate-route.test.ts` nuevo, `tests/evaluate.test.ts`, `tests/evaluation-input.test.ts`, `e2e/pantalla.spec.ts`, `specs/textos-motivo-y-frase.md`, `progress/current.md`).

#### Comandos corridos

- `git status --short` y `git diff --stat HEAD`: cambian solo los 5 archivos de arriba más el test nuevo. `git diff --quiet HEAD -- app lib components`: **sin cambios de producción**.
- `git diff HEAD` completo (tests, e2e, spec, progress) y `git diff --stat origin/main` (17 archivos, +559/−80, más los 65 del test nuevo).
- `npm run check` con Node `v20.20.2` — **en verde**: eslint y `tsc` limpios, **214 unitarios** (16 archivos) y **15 e2e**.
- Mutaciones temporales del código de producción, una por bloqueante, con `sha256sum` antes y `git checkout -- <archivo>` después (los archivos de producción no tenían cambios sin commitear):
  - Ruta, un inválido pasa como `0` (`app/api/evaluate/route.ts:44`): **3 de 9** fallan en `tests/evaluate-route.test.ts` («0», «150», «abc»).
  - Ruta, el tope se ignora (`route.ts:30`): **3 de 9** fallan (las tres conversiones).
  - `evaluate`, `>` pasa a `>=` (`lib/evaluate.ts:605`): falla el unitario de la frontera.
  - `constraintsField` sin la guarda (`lib/evaluation-input.ts:141`): fallan los **4** casos de `it.each`.
  - Pantalla sin `.replace(",", ".")` (`components/stock-proof-screen.tsx:99`): falla el e2e de «0,5» (`Received: "0,5"`).
  - Pantalla que manda el tope vacío (`stock-proof-screen.tsx:97`): falla el e2e del tope vacío (`Received value: ""`).
  - Después de restaurar: `sha256sum -c` **OK** en los cuatro archivos y `git diff --stat HEAD` sigue mostrando solo tests, e2e, spec y progress.
- `check-map` sobre el diff contra `origin/main` más el test nuevo: sigue en **`1`** (falta el mapa, igual que en `main`). No es `2`.
- Búsqueda de secretos en `git diff HEAD`: nada nuevo. Sin `.env`, sin commit, sin push.

#### Bloqueantes de la primera vuelta

1. **Resuelto.** `tests/evaluate-route.test.ts` mockea `buildEvaluateInput`, deja el `evaluate` real y llama a `POST`. `"0.5"`, `0.5` y `"1"` llegan como fracción. `"0"`, `"150"`, `"abc"`, `true` y `null` llegan sin `maxImpactRatio`, con 200 y con la `Evaluation`. Sin tope en el cuerpo no se inventa uno. Las mutaciones lo confirman.
2. **Resuelto.** `tests/evaluate.test.ts:719-735`: el tope sale de `impactRatioFromPercent("0,7")` y el impacto es `0.7 / 100`; da `violated: []`. Con `>=` falla.
3. **Resuelto.** `tests/evaluation-input.test.ts:270-279`: `0`, `-0.01`, `NaN` e `Infinity` dejan `constraints` en `undefined`. Sin la guarda fallan los cuatro.
4. **Resuelto.** `e2e/pantalla.spec.ts:76-106`: «En vivo» con `page.route` (sin red real). «0,5» viaja como `"0.5"`; el tope vacío no manda la clave; se comprueba una sola llamada y que la pantalla pinte el resultado. Cada mutación rompe su caso.

#### Spec y progress

- La spec suma tres criterios (ruta, frontera, contrato pantalla→ruta), cada uno con su test. Aclara que un tope inválido frena en cualquier escena, coherente con `stock-proof-screen.tsx:76-82`. Los conteos (214 y 15) coinciden con este `check`.
- `progress/current.md`: rama sobre `2e05e8b`, criterios al día, y la nota del test quitado ahora dice que lo sacó #45.

#### Hallazgos (no bloqueantes)

- En `tests/evaluate-route.test.ts`, los casos `true` y `null` no fallan con la mutación «el inválido pasa como 0»: los frena antes el `typeof` de `route.ts:42`. Tampoco fallarían sin ese `typeof`, porque `"true"` y `"null"` dan `null`. Sobran, pero documentan el contrato y no estorban.
- El cuerpo del PR #44 todavía dice «179 unitarios, 12 e2e». No es del repo; actualizarlo al pushear.
- `progress/current.md:3` dice «Estado: en revisión». Con esta aprobación, el líder lo pasa a terminada al cerrar.
- Siguen para otra tarea: formatos raros en `lib/phrase.ts:9` (`0x10`, `1e1`) y crear `docs/mapa-agentes.json`.
