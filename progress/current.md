# Tarea: Separar la landing de la app

- Estado: terminada (revisor aprobó, 3 oct 2026)
- Spec: specs/landing-y-app.md (Estado: aprobada — Agustín, 3 oct 2026: «Aprobada. Usa librerías como three.js para el dinamismo»)
- Rama: `feat/landing-y-app`, desde `main` (`cfe570a`, después de #44)
- Issue: N/A. Esta vez la pantalla la manejamos nosotros (decisión de Agustín).
- Criterios de aceptación (de la spec):
  - [x] `/` muestra la `h1` «Ves la compra.» y no tiene campos de ticker, monto ni tope (e2e `e2e/landing.spec.ts`).
  - [x] Pestañas de la muestra: arranca en «Pasa»; «Corta en la salida» y «Contrato impostor» cambian el resultado; ninguna firma activa ni llamada a `/api/evaluate` (e2e).
  - [x] `data-recorrido` sigue la pestaña (e2e). `operationStops` y `pulseStop` son puras y tienen unitario (`tests/question-statuses.test.ts`).
  - [x] Con `reducedMotion: "reduce"` la escena marca `data-movimiento="reducido"` y dibuja un cuadro fijo (e2e; se salta si el navegador no tiene WebGL).
  - [x] `/app` no tiene `canvas` y no pide ningún script de three (e2e en `e2e/pantalla.spec.ts`).
  - [x] «Probar» y «Ver la operación» llevan a `/app` (e2e).
  - [x] Los recorridos de `e2e/pantalla.spec.ts` pasan contra `/app`.
  - [x] `/app` sin links de secciones ni menú; el logo vuelve a `/` (e2e).
  - [x] 390 px sin scroll horizontal en `/` y en `/app` (e2e).
  - [x] `npm run check` en verde (3 oct 2026, Node 20: eslint, tsc, 219 unitarios, 20 e2e).
- Revisión: Aprobado — ver `## Revisión` al final.
- Plan: mover `questionStatuses` a `lib/` → ruta `/app` con `AppHeader` → muestra con pestañas en `/` → escena three.js → links a `/app` → e2e repartidos → `npm run check`.
- Decisiones:
  - `questionStatuses` pasó a `lib/question-statuses.ts`. La escena y la lista del resultado usan la misma función, así que la escena no decide nada.
  - La firma es la quinta parada: pasa solo si la evaluación es `pass`.
  - three.js se importa con `import("three")` dentro del componente cliente. `/app` no lo baja (verificado en el navegador y fijado en el e2e).
  - Sin `@react-three/fiber`: es una sola escena chica.
  - La escena se pausa fuera de pantalla y con la pestaña oculta. Al desmontar libera geometrías, materiales y el renderer.
  - El e2e de movimiento reducido espera la marca `data-webgl` hasta 20 s: con el servidor de desarrollo en frío, compilar three tarda más que los 5 s por defecto.
- Notas:
  - La tarea anterior (textos de motivo y frase de tope) quedó archivada en `progress/history/2026-10-03-textos-y-frase.md`. Ya está en `main` (#44).
  - `npm install three @types/three` reportó 9 vulnerabilidades de dependencias que ya estaban; three no trae dependencias propias.

## Revisión

- **Veredicto: Aprobado.**
- Revisor: revisor general (agente, Cursor), 2026-10-03. Cambios sin commitear sobre `cfe570a`.

### Comandos corridos

- `node -v && npm run check` con Node 20 → `v20.20.2`, salida **0**: eslint y tsc limpios, **219/219** unitarios (17 archivos, incluye `tests/question-statuses.test.ts` con 5), **20/20** e2e. El e2e de movimiento reducido **corrió** (no se salteó: el Chromium de prueba tiene WebGL).
- Mutaciones temporales (copia en `/tmp`, restauradas con `cp` y verificadas con `sha256sum -c`: los 4 archivos `OK`):
  - `operationStops` con la firma siempre `passed` (`lib/question-statuses.ts:41`) → 3 unitarios y el e2e «la muestra cambia de ejemplo» fallan.
  - `const reduced = false` (`components/operation-scene.tsx:90`) → falla «la escena dibuja un cuadro fijo» (`data-movimiento="animado"`).
  - `Wordmark` con `href="#top"` (`components/wordmark.tsx:5`) → falla «la app muestra el formulario con un encabezado mínimo» (`toHaveURL`).
  - Pestañas con `onClick` vacío (`components/example-showcase.tsx:67`) → falla el e2e de la muestra.
- Script de Playwright contra el dev de `:3000`: `/` pide `…node_modules_three_build_three_module_js.js`; `/app` pide **0** scripts de three. El filtro `/three/i` de `e2e/pantalla.spec.ts:48` detecta three de verdad.
- `check-map` → sale **1** («no hay docs/mapa-agentes.json»), igual que en `main` y en las dos revisiones anteriores. No es `2`; hueco del repo, no de esta tarea.
- `git diff HEAD --name-only` y `ls`: `.env` no aparece tocado; sin keys ni secretos en `app/`, `components/`, `lib/question-statuses.ts`, `e2e/landing.spec.ts`. `package-lock.json` suma `three` y `@types/three` con las dependencias de tipos de este último (`@types/webxr`, `@webgpu/types`, `fflate`, `meshoptimizer`, etc., todas de desarrollo).

### Criterios verificados

- `h1` «Ves la compra.» y sin Ticker/Monto/Tope/Evaluar en `/`: `app/page.tsx:11` (sin `StockProofScreen`); e2e `e2e/landing.spec.ts:3-11`.
- Muestra arranca en «Pasa», cambia a «Corta en la salida» y «Contrato impostor», sin llamadas a `/api/evaluate`: `components/example-showcase.tsx:10-15,25-29`; e2e `e2e/landing.spec.ts:13-53`.
- Escena refleja la pestaña con `data-recorrido`: `components/operation-scene.tsx:75`; estados de `operationStops` → `questionStatuses` (`lib/question-statuses.ts:37-43`); el pulso usa `pulseStop` (`lib/question-statuses.ts:46-49`), que solo busca la primera parada no pasada. La escena no decide el corte. Unitario: `tests/question-statuses.test.ts:30-40` ata las paradas a la lista del resultado para todos los ejemplos.
- Movimiento reducido: cuadro fijo (`components/operation-scene.tsx:90-91,289-292`, sin `requestAnimationFrame`); e2e `e2e/landing.spec.ts:71-82`.
- `/app` sin three: `import("three")` dinámico (`components/operation-scene.tsx:49`), `OperationScene` solo se usa en `example-showcase.tsx`, que solo importa `app/page.tsx`; e2e `e2e/pantalla.spec.ts:28-55` (sin `canvas`, sin script de three).
- «Probar», «Ver la operación» y «Probar una evaluación» → `/app`: `components/site-header.tsx:38`, `components/site-sections.tsx:79,288`; e2e `e2e/landing.spec.ts:55-69`.
- Recorridos de `e2e/pantalla.spec.ts` contra `/app` (`goto("/app")` en las líneas 12, 30, 58, 69, 101): todos pasan.
- `/app` sin links de secciones ni menú, logo a `/`: `components/site-header.tsx:55-64`, `components/wordmark.tsx:5`; e2e `e2e/pantalla.spec.ts:45-55`.
- 390 px sin scroll horizontal: `e2e/landing.spec.ts:84-95` y `e2e/pantalla.spec.ts:56-66`.
- Título propio de `/app`: `app/app/page.tsx:6-10`. Pie con la advertencia: `SiteFooter` en `app/app/page.tsx:27`.

### Accesibilidad y recursos

- Pestañas: `role="tablist"`/`tab`/`tabpanel`, `aria-selected`, `aria-controls`, `aria-labelledby`, tabindex móvil y flechas izquierda/derecha con foco (`components/example-showcase.tsx:31-38,53-80`); e2e prueba `ArrowRight` + foco (`e2e/landing.spec.ts:45-48`). Escena `aria-hidden` (`operation-scene.tsx:73`).
- Al desmontar: `cancelled` evita crear la escena si `import()` resuelve tarde; `dispose` cancela el frame, desconecta los observers, libera geometrías y materiales recorriendo la escena (incluida la geometría actual del tramo), `renderer.dispose()` y saca el canvas (`operation-scene.tsx:57-61,298-312`). Pausa fuera de pantalla y con la pestaña oculta (`:269,283-286`). Sin WebGL: `try/catch` y `data-webgl="no"` (`:82-87`).

### Hallazgos bloqueantes

- Ninguno.

### Hallazgos no bloqueantes

- `e2e/landing.spec.ts:51` solo comprueba «Firmar swap» deshabilitado en la última pestaña; el criterio dice «ninguna pestaña». Hoy el botón está fijo en `disabled` (`components/evaluation-result.tsx:212`), así que no hay riesgo real; se puede iterar las cuatro pestañas.
- `dispose` no llama `renderer.forceContextLoss()`: al ir y volver entre `/` y `/app` con navegación cliente, cada montaje crea un contexto WebGL y el navegador los libera tarde (Chrome avisa desde ~16). Agregarlo antes de `renderer.dispose()` (`operation-scene.tsx:310`).
- Pestañas sin `Home`/`End` (opcional en el patrón ARIA de tabs).
- El filtro `/three/i` del e2e depende del nombre de chunk del servidor de desarrollo; con `next build` los chunks tienen hash y el chequeo pasaría vacío. Hoy e2e y CI corren contra `npm run dev`, así que vale.
- El e2e de movimiento reducido se saltea si el navegador no tiene WebGL; en CI conviene confirmar en el log que corre.
- El link «Probar con tu ticker y tu monto» de la muestra (`example-showcase.tsx:104`) no tiene e2e.
- `app/globals.css` repite `@media (max-width: 1100px)` al final; se puede unir con el bloque de arriba.
- Tamaño: unas 950 líneas con CSS y tests (unas 700 de producción), por encima de las 450 estimadas en la spec. Es un solo slice coherente (ruta, muestra y escena), así que se revisó igual.

### Retro (mejorar-skills, sin publicar)

- **Skill:** reviewer + verify-check + check-map. **Desvío:** ninguno. **Decisión no cubierta:** cómo probar «no carga three» sin depender del nombre de chunk de dev. **Revisión:** cobertura parcial del criterio de firma deshabilitada y falta de `forceContextLoss`.

### Después de la aprobación (líder, 2026-10-03)

- No bloqueante 1, resuelto: `e2e/landing.spec.ts` comprueba en cada pestaña que no haya un botón «Firmar swap» habilitado.
- No bloqueante 2, resuelto: `dispose` llama a `renderer.forceContextLoss()` (`components/operation-scene.tsx`).
- `npm run check` sigue en verde (Node 20: 219 unitarios, 20 e2e). El resto de los no bloqueantes quedan anotados para otra tarea.
