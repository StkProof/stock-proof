# Tarea: una pregunta por archivo, `evaluate` solo orquesta, umbrales en un solo archivo

- Estado: terminada (revisor aprobó, 7 oct 2026). Falta commit + PR, cuando Agustín lo pida.
- Spec: specs/estructura-preguntas.md (Estado: aprobada — Agustín, 7 oct 2026)
- Rama: `chore/estructura-preguntas`, desde `main` (`5f122ab`, después de #48)
- Issue: #3
- Entorno: `init.sh` en verde con Node 20 (7 oct 2026): 219 unitarios, 25 e2e. Hizo falta `npm ci` (el worktree no tenía `node_modules`).
- Criterios de aceptación (de la spec):
  - [x] Unitarios y e2e actuales pasan sin cambiar aserciones; solo cambian rutas de `import` (`tests/evaluate.test.ts`, `tests/q4.test.ts`, `tests/exit-now.test.ts`, `tests/messages.test.ts`).
  - [x] `decideQuestion2` con unitarios propios (`tests/q2.test.ts`, 6).
  - [x] La pregunta 1 con unitarios propios (`tests/q1-gate.test.ts`, 6: `checkTarget` y `decideQuestion1`).
  - [x] Textos de `IMPACT_OVER_LIMIT` y `EXIT_OVER_LIMIT` salen de `IMPACT_LIMIT` (`tests/messages.test.ts`, con un mock del umbral en 0.007 que da «0,7%»).
  - [x] Ningún umbral numérico fuera de `lib/thresholds.ts` (`rg` sobre `lib/` y `components/messages.ts`).
  - [x] `lib/evaluate.ts` no compara impactos ni precios (617 → 484 líneas).
  - [x] `npx -p node@20 npm run check` en verde (7 oct 2026): eslint, tsc, 234 unitarios (219 + 15 nuevos), 25 e2e.
- Plan: `lib/thresholds.ts` → `q2-reasons.ts` + `q2.ts` + tests → `q1-gate.ts` + tests → `buildReference` a `q3.ts` → `constraints.ts` → `evaluate.ts` orquesta → textos desde el umbral → check → revisor.
- Decisiones: ver la sección «Decisiones técnicas» de la spec. Además:
  - La pregunta 1 quedó en dos funciones de `q1-gate.ts`: `checkTarget` (contrato pegado, antes de validar cotizaciones) y `decideQuestion1` (cotizaciones). Juntarlas cambiaba el orden: con contrato impostor y cotizaciones inválidas, hoy gana el corte de la pregunta 1.
  - `FLOAT_TOLERANCE` se renombró a `PRICE_MATCH_TOLERANCE` al moverse, para que el nombre diga para qué es.
  - `AGENTS.md` y `README.md` decían que la lógica vive en `lib/evaluate.ts`: se actualizaron a la estructura nueva.
- Notas:
  - Diagnóstico de los otros issues de base (7 oct 2026), sin tocar todavía:
    - #14 (estado de mercado) está hecho en la práctica: `getMarketStatus` (`lib/binance/rwa-public.ts:158`) es la única función y la usan la pregunta 4 y Exit Availability, con una sola lectura por evaluación (`lib/evaluation-input.ts:188-190`). Falta decidir si se cierra.
    - #13 (precios) está a medias: `getTokenDynamic` da el precio del token y el de referencia para la pregunta 3, pero no hay precio por pool para la pregunta 4 (`poolsDiffRatio` nunca llega en vivo) y `Fuentes.md` no tiene fuente para eso.
  - La tarea anterior quedó en `progress/history/2026-10-07-casos-al-elegir.md`. Ya está en `main` (#48).

## Revisión

- **Veredicto: Aprobado.**
- Revisor: revisor general (agente, Cursor), 2026-10-07. Cambios sin commitear en `chore/estructura-preguntas` sobre `origin/main` (`5f122ab`).

### Comandos corridos

- `git status` / `git diff origin/main --stat` → 12 archivos rastreados (+114/−196; `lib/evaluate.ts` 617 → 484 líneas), `git mv` de `progress/current.md` a `progress/history/2026-10-07-casos-al-elegir.md` (100 % igual), y nuevos `lib/thresholds.ts`, `lib/questions/{q1-gate,q2,q2-reasons,constraints}.ts`, `tests/{q1-gate,q2}.test.ts`, `specs/estructura-preguntas.md`, `progress/current.md`. Unas 420 líneas nuevas entre código, tests, spec y progress: se revisa de una sentada.
- `npx -y -p node@20 npm run check` → salida **0**: eslint y tsc limpios, **234/234** unitarios (19 archivos; 219 de antes + 6 de `q2` + 6 de `q1-gate` + 3 de `messages`), **25/25** e2e.
- Mutaciones temporales (copia en `/tmp/rev-bak`, restauradas con `cp` y verificadas con `sha256sum -c`: `q2.ts`, `q1-gate.ts`, `thresholds.ts` y `evaluate.ts` dan `OK`). Cada una con `vitest run` bajo Node 20:
  - `lib/questions/q2.ts:18` `impactRatio <= IMPACT_LIMIT` → `<` → **2 fallan** (`evaluate` «acepta una compra y una venta exactamente del 1%» y `q2` «compra y venta justo en el tope todavía firman»).
  - `lib/questions/q1-gate.ts:45` la rama «sin verificar» nunca corre (el impostor gana) → **2 fallan** (`evaluate` «es "no se pudo evaluar" y no impostor…» y `q1-gate` «una sin verificar gana sobre los impostores»).
  - `lib/thresholds.ts:11` `IMPACT_LIMIT = 0.02` → **6 fallan** (4 de `evaluate`, el de «1%» de `messages`, «corta por la compra» de `q2`).
  - `lib/questions/q2.ts:47` `tied: false` siempre → **2 fallan** (desempate en `evaluate` y en `q2`).
  - `lib/questions/q2.ts:25` sin la compuerta de venta (`costRatio <= IMPACT_LIMIT` fuera) → **9 fallan** (`evaluate`, `q2` y `question-statuses`).
  - `lib/evaluate.ts:315` el `EXIT_NOW_UNAVAILABLE` sin `quotes`/`exits` → **1 falla** (`evaluate` «sin cotización de venta no se firma…»).
- `rg -n '0\.01\b|0\.001\b|1e-9|1 ?%' lib components/messages.ts` (sin `lib/thresholds.ts` ni `lib/evaluation-examples.ts`) → solo comentarios: `components/messages.ts:4`, `lib/evaluate.ts:24`, `lib/evaluation-input.ts:43-44`, `lib/questions/q4.ts:15`, `lib/format.ts:31`, `lib/phrase.ts:2-3`. Ningún literal de umbral en código.
- `rg` de `IMPACT_LIMIT|POOLS_DIVERGENCE_LIMIT|PRICE_MATCH_TOLERANCE|FLOAT_TOLERANCE` → solo usos importados (`q2.ts`, `q3.ts:67`, `q4.ts:62`, `messages.ts:9`); ninguna definición fuera de `lib/thresholds.ts`, `FLOAT_TOLERANCE` ya no existe.
- `check-map` → sale **1** («no hay docs/mapa-agentes.json»), igual que en las revisiones anteriores: hueco del repo, no de esta tarea.
- `git status --porcelain --ignored | rg -i '\.env'` y `rg -i 'api[_-]?key|secret|password|PRIVATE|0x[0-9a-f]{64}'` sobre el diff y los archivos nuevos → sin resultados: `.env` no se tocó y no hay secretos.

### Criterios verificados

- **Sin cambio de comportamiento; aserciones intactas.** El diff de `tests/evaluate.test.ts`, `tests/exit-now.test.ts` y `tests/q4.test.ts` es solo la ruta de `import` de `IMPACT_LIMIT` / `POOLS_DIVERGENCE_LIMIT` a `@/lib/thresholds`; en `tests/messages.test.ts` cambia el `import` de `Q2_CUT_REASONS` y se agrega un bloque nuevo (`:47-74`), sin tocar aserciones viejas. Comparación línea por línea contra `git show origin/main:lib/evaluate.ts`:
  - Orden de cortes igual: inválido → contrato pegado (`lib/evaluate.ts:278-292`) → `normalizeQuotes`/`QUOTES_UNAVAILABLE` sin `quotes` (`:294-297`) → pregunta 1 (`:299-305`) → pregunta 2 (`:307-317`) → 3 → 4 → topes. `checkTarget` corre antes de validar cotizaciones, como antes (`lib/questions/q1-gate.ts:19-29`).
  - Pregunta 1: `unavailable` sin `quotes`, `cut` con `quotes` (`lib/evaluate.ts:300-305`), igual que antes. «Sin verificar» gana a impostor y el motivo del corte es el del de menor impacto, con fallback `CONTRACT_NOT_LISTED` (`lib/questions/q1-gate.ts:42-56`).
  - Pregunta 2: compuerta de compra `<=` (`lib/questions/q2.ts:18`), de venta `<=` (`:23-26`), `EXIT_OVER_LIMIT` si alguna venta medida supera el tope y si no `EXIT_NOW_UNAVAILABLE` (`:28-36`), mínimo + desempate por `WRAPPERS` + `tied: atBest.length > 1` (`:38-47`). Campos: los dos `cut` llevan `quotes` + `exits` (`lib/evaluate.ts:308-310`); `EXIT_NOW_UNAVAILABLE` lleva `quotes` + `exits` y el `QUOTES_UNAVAILABLE` (sin ganador) no (`:311-316`), igual que antes.
  - `buildReference` (`lib/questions/q3.ts:75-96`) usa `usablePrice`/`usableMultiplier` (`:51-64`), que son idénticos al viejo `usableNumber` (finito y > 0). `checkConstraints` (`lib/questions/constraints.ts:7-30`) es copia exacta.
- **`decideQuestion2` con unitarios propios** (`tests/q2.test.ts`): compra sobre el tope (`:31`), venta medida sobre el tope (`:39`), venta sin medir — `"unavailable"` y ausente — (`:47`), gana el siguiente firmable (`:55`), empate bStocks → Ondo → xStocks con el de bStocks sin venta (`:63`), y el borde justo en el tope (`:71`).
- **Pregunta 1 con unitarios propios** (`tests/q1-gate.test.ts`): contrato pegado sin verificar (`:22`), impostor (`:30`), todas impostoras con el motivo del de menor impacto (`:47`), una sin verificar gana a los impostores (`:55`).
- **«1%» sale de `IMPACT_LIMIT`**: `limitPercentText` con `toLocaleString("es-AR", { maximumFractionDigits: 2 })` como pide la spec (`components/messages.ts:5-9,37,39`); el test fija «1%» hoy y «0,7%» con `IMPACT_LIMIT` mockeado en 0.007 (`tests/messages.test.ts:47-67`), y el formato sin espacio ni decimales sobrantes (`:69-73`).
- **Umbrales en un solo archivo**: `lib/thresholds.ts:11,19,26`, cada uno con su motivo y fuente; sin reexportar desde `lib/evaluate.ts` ni desde `q4.ts`.
- **`evaluate` solo orquesta**: `lib/evaluate.ts` ya no compara impactos ni precios; lo que queda es validación de entrada (`normalizeQuotes`, `normalizeExits`, `usableExitNow`, `:409-484`) y el armado del resultado.
- **Importación circular** (`q2.ts` → valor `WRAPPERS` de `evaluate.ts`): `WRAPPERS` se usa solo dentro de la función (`lib/questions/q2.ts:40`); los 234 unitarios y los 25 e2e cargan bien.
- `AGENTS.md:47` y `README.md:23` se actualizaron a la estructura nueva.

### Hallazgos bloqueantes

- Ninguno.

### Hallazgos no bloqueantes

- La spec no refleja la división de la pregunta 1 en dos funciones. La tabla (`specs/estructura-preguntas.md:28`) y el último criterio (`:46`) hablan solo de `decideQuestion1`, pero el código usa `checkTarget` + `decideQuestion1` (decisión anotada en este archivo, con su motivo de orden). `evaluate` también llama a `buildReference`. Conviene ajustar esas dos líneas de la spec en el mismo PR.
- `decideQuestion1([])` devuelve `cut` con `CONTRACT_NOT_LISTED` (guarda `cheapest !== undefined`, `lib/questions/q1-gate.ts:51`); antes `evaluate` habría explotado ahí. No cambia nada desde `evaluate`, porque `normalizeQuotes` nunca deja pasar una lista vacía, pero es un caso de la función suelta que no tiene test.
- `lib/questions/q1-gate.ts:45` repite `isUnavailableReason(...)` solo para que TypeScript angoste el tipo. Funciona; si molesta, un type guard sobre la cotización lo deja más corto.
- La rama `QUOTES_UNAVAILABLE` de `lib/questions/q2.ts:44-46` no se alcanza (con `signable` no vacío siempre hay ganador). Ya estaba así en `main`; se mantiene a propósito por fail closed.
- Fuera de alcance: `AGENTS.md:49` todavía dice que las APIs de Binance «todavía no existen», pero `lib/binance/` ya está en `main`.

### Después de la revisión

- Se atendió el primer hallazgo no bloqueante: la tabla y los criterios de `specs/estructura-preguntas.md` nombran `checkTarget`, `decideQuestion1` y `buildReference`. Es un cambio solo de texto; el check no cambia.
- Quedan sin atender, por chicos: el test de `decideQuestion1([])`, la doble llamada a `isUnavailableReason` y la rama inalcanzable de `q2.ts` (ya estaba en `main`).
- Fuera de alcance, para otra tarea: `AGENTS.md:49` dice que las APIs de Binance «todavía no existen».
