# Tarea: La app abre con un caso y lo aplica al elegirlo

- Estado: terminada (revisor aprobó, 7 oct 2026)
- Spec: specs/casos-al-elegir.md (Estado: aprobada — Agustín, 7 oct 2026)
- Rama: `feat/casos-al-elegir`, desde `main` (`77ef085`, después de #47)
- Issue: N/A. Rescata el comportamiento de pantalla de #46, que se cierra sin mergear (decisión de Agustín, 7 oct 2026).
- Criterios de aceptación (de la spec):
  - [x] `/app` abre, sin clic, con el caso que pasa y la frase `QQQB` / `200` / `1`; sin campo de dirección (e2e).
  - [x] Cada caso guardado completa la frase y muestra su resultado sin apretar Evaluar (e2e).
  - [x] El impostor muestra la dirección `0x…dead`; «Revisar un contrato» la abre sin borrar el resultado (e2e).
  - [x] «En vivo» no llama a `/api/evaluate` hasta Evaluar (e2e).
  - [x] Tope `0` pide corrección sin resultado (e2e).
  - [x] Criterios de `/app` de `specs/landing-y-app.md` siguen en pie (e2e).
  - [x] `npm run check` en verde (7 oct 2026, Node 20: eslint, tsc, 219 unitarios, 25 e2e).
- Revisión: Aprobado — ver ## Revisión al final.
- Plan: traer `components/stock-proof-screen.tsx` de #46 → `e2e/pantalla.spec.ts` de #46 apuntando a `/app`, con el test de encabezado mínimo de #47 → spec nueva → `npm run check`.
- Decisiones:
  - De #46 entra solo la pantalla y sus e2e. `/operar`, el `SiteHeader mode="product"`, los cambios de portada y `specs/presentacion.md` quedan afuera: #47 ya separó las dos pantallas con `/app`.
  - El título de la pantalla sigue en `h2`, porque `/app` ya tiene su `h1`.
  - Los tests de portada de #46 no entran: los cubre `e2e/landing.spec.ts`.
- Notas:
  - Con Node 24 falla `tests/format.test.ts` (el ICU de Node 24 usa otro espacio en «p. m.»). No es de este cambio: el CI corre Node 20 y ahí pasa. Correr el check con `npx -p node@20 npm run check`.
  - La tarea anterior (separar landing y app) quedó en `progress/history/2026-10-03-landing-y-app.md`. Ya está en `main` (#47).

## Revisión

- **Veredicto: Aprobado.**
- Revisor: revisor general (agente, Cursor), 2026-10-07. Cambios sin commitear en `feat/casos-al-elegir` sobre `origin/main` (`77ef085`).

### Comandos corridos

- `git status` / `git diff origin/main --stat` → `components/stock-proof-screen.tsx` (+108/−37), `e2e/pantalla.spec.ts`, `specs/landing-y-app.md` (1 línea), `git mv` de `progress/current.md` a `progress/history/2026-10-03-landing-y-app.md` (100 % igual), nuevos `progress/current.md` y `specs/casos-al-elegir.md`.
- `npx -y -p node@20 npm run check` → salida **0**: eslint y tsc limpios, **219/219** unitarios (17 archivos), **24/24** e2e (19 en `e2e/pantalla.spec.ts`, 5 en `e2e/landing.spec.ts`, el de movimiento reducido corrió).
- Mutaciones temporales en `components/stock-proof-screen.tsx` (copia en `/tmp`, restaurada con `cp` después de cada una y verificada con `sha256sum -c`: el componente y `e2e/pantalla.spec.ts` dan `OK`). Cada una con `playwright test e2e/pantalla.spec.ts` bajo Node 20:
  - `applyCase` sin `setResult(evaluationExamples[demo.key])` (`:114`) → **7 fallan** (los recorridos de `cutQuestion1`, `cutQuestion2`, `cutExitNow`, `invalid`, `unavailable`, `passThinNameSinDato`, `passTopeFrase`).
  - `showAddress` arranca en `true` (`:87`) → **2 fallan** («la app abre con el caso que pasa, sin un clic» y «revisar un contrato muestra la dirección sin evaluar»).
  - `chooseScene("live")` sin `setResult(null)` (`:123`) → **1 falla** («en vivo no consulta hasta apretar Evaluar»).
  - Tope del caso «El tope de la frase no se cumple» en `"1"` en vez de `"0,3"` (`:42`) → **1 falla** («un tope de la frase que no se cumple…»).
- `check-map` → sale **1** («no hay docs/mapa-agentes.json»), igual que en las revisiones anteriores: hueco del repo, no de esta tarea.
- `git status --porcelain --ignored | rg env` y `git diff origin/main | rg -i 'api[_-]?key|secret|BINANCE_'` → sin resultados: `.env` no se tocó y el diff no trae keys.

### Criterios verificados

- Abre sin clic con el caso que pasa (`QQQB` / `200` / `1`, sin campo de dirección): estado inicial desde `OPENING = CASES[0]` y `evaluationExamples.pass` (`components/stock-proof-screen.tsx:27,79,83-90`); dirección oculta por `showAddress` (`:87,251-272`); e2e `e2e/pantalla.spec.ts:75-96` (veredicto, cuatro «Pasó», «sin dato» sin `POOL_DISPERSION`, «Firmar swap» deshabilitado).
- Cada caso completa la frase y aplica su resultado sin Evaluar: `applyCase` (`components/stock-proof-screen.tsx:105-115`) y `chooseScene` (`:117-127`); un recorrido por caso en `e2e/pantalla.spec.ts:219` (`cutQuestion1`), `:250` (`cutQuestion2`), `:287` (`cutExitNow`), `:314` (`invalid`), `:349` (`unavailable`), `:365` (`passThinNameSinDato`), `:386` (`passTopeFrase`); ninguno aprieta Evaluar (`elegirCaso`, `:32-35`).
- Impostor con `0x…dead`; «Corta: el monto no entra» sin dirección: `components/stock-proof-screen.tsx:44-51`, coincide con `ADDR.impostor` del ejemplo (`lib/evaluation-examples.ts:11,106`); e2e `e2e/pantalla.spec.ts:227-229` y `:258`.
- «Revisar un contrato» muestra la dirección sin borrar el resultado: el botón solo hace `setShowAddress(true)` (`components/stock-proof-screen.tsx:265-271`); e2e `e2e/pantalla.spec.ts:98-104`.
- «En vivo» espera Evaluar: al elegirlo borra el resultado y no hace `fetch` (`components/stock-proof-screen.tsx:118-124`); el `fetch` está solo en `onSubmit` con `scene === LIVE` (`:146-165`); e2e cuenta llamadas en 0 hasta el clic (`e2e/pantalla.spec.ts:106-132`). `maxImpactPercent` solo con tope válido: `:160-162`; e2e `:152-182`.
- Tope `0` pide corrección sin resultado: `components/stock-proof-screen.tsx:139-145`; e2e `e2e/pantalla.spec.ts:141-150` (corre sobre el caso guardado, así que cubre también «tampoco en un caso de ejemplo»).
- `0,3` es presentación: el ejemplo ya está calculado con `maxImpactRatio: 0.003` (`lib/evaluation-examples.ts:182`); la pantalla no recalcula.
- Criterios de `/app` de `specs/landing-y-app.md` siguen: encabezado mínimo, sin `canvas` ni three, logo a `/` (`e2e/pantalla.spec.ts:37-61`); 390 px sin scroll horizontal (`:63-73`). La spec vieja se actualizó para apuntar a la nueva (`specs/landing-y-app.md:28`).
- La pantalla no decide el corte: solo muestra `evaluationExamples[...]` (`components/stock-proof-screen.tsx:114,134,147`), lo que devuelve `POST /api/evaluate` (`:165`) o el `unavailable` fijo si la red falla (`:167`, sin cambios respecto de `main`). No importa `evaluate` ni compara números.
- La spec coincide con el comportamiento: selector «Caso» con `name="escena"` (`:273-276`), «En vivo» al final (`:285`), título en `h2` (`:176`), cartel «Ejemplo guardado · no consulta el mercado» (`:182-184`).

### Hallazgos bloqueantes

- Ninguno.

### Hallazgos no bloqueantes

- `specs/casos-al-elegir.md:3` dice «Estado: en revisión». El plan está aprobado por Agustín (7 oct 2026), así que conviene pasarlo a «aprobada» con esa cita antes del PR, como en `specs/landing-y-app.md`.
- El caso borde «un caso de ejemplo no llama a `/api/evaluate`, aunque después se apriete Evaluar» (`specs/casos-al-elegir.md:40`, código en `components/stock-proof-screen.tsx:146-148`) no tiene e2e propio. Se puede contar llamadas con `page.route` después de Evaluar en el caso inicial.
- El cartel «Ejemplo guardado · no consulta el mercado» que pide la spec (`specs/casos-al-elegir.md:14`) no está fijado en un e2e, ni su cambio a «Consulta en vivo · BSC».
- El pie de la pantalla todavía habla de «escenas» (`components/stock-proof-screen.tsx:317`) mientras el selector ya dice «Caso». Detalle de texto.
- El test «la frase pide el contrato real y un tope de costo» (`e2e/pantalla.spec.ts:134-139`) repite lo que ya prueba el de apertura (`:78-83`).

### Después de la revisión

- Se atendieron tres hallazgos no bloqueantes: la spec pasó a «aprobada»; nuevo e2e «un caso guardado no consulta aunque se apriete Evaluar» (con su criterio en la spec); el pie dice «casos» y «En vivo» en vez de «escenas». `npx -p node@20 npm run check` sigue en 0 (219 unitarios, 25 e2e).
- Quedan sin atender, por chicos: el cartel «Ejemplo guardado» sin e2e propio y el test de la frase repetido.
