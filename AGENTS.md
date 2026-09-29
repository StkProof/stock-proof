# AGENTS.md (proyecto: StockProof)

Repo de **StockProof**, el producto de la hackathon BNB Hack: Tokenized Stocks. El contexto de producto vive en el vault de este workspace (`../stockproof-vault/`), no se duplica acá.

## Contexto de producto

Leer en este orden, antes de cambiar comportamiento:

1. `../stockproof-vault/Índice.md`
2. `../stockproof-vault/Idea.md` — las cuatro preguntas y el corte.
3. `../stockproof-vault/MVP.md` — qué entra en cada ventana.
4. `../stockproof-vault/Brief.md` — fechas, stack de APIs y restricciones.
5. `../stockproof-vault/Alineamiento.md` y `../stockproof-vault/Dolores.md` — por qué se construye esto.
6. `../stockproof-vault/Fuentes.md` — de dónde salen los números. Si una cifra no está ahí, no entra.

## Stack

Next.js 15 + React 19 + TypeScript, copiado de la plantilla Next.js de `agent-harness`. Tests unitarios con Vitest (`tests/`), e2e con Playwright (`e2e/`).

## Comandos

- `npm run dev` — desarrollo local (http://localhost:3000).
- `npm run check` — **validación oficial**: lint + typecheck + unitarios + e2e. Sale ≠ 0 si algo falla.
- `npm test` — solo unitarios. `npm run test:e2e` — solo e2e (necesita `npx playwright install` la primera vez).

## Reglas del harness

- Antes de empezar: leer `progress/`, correr `./init.sh`, leer la spec si la tarea la tiene.
- Una tarea a la vez, con criterios de aceptación claros.
- Tarea no trivial sin spec aprobada en `specs/`: no se implementa. La tarea en `progress/` apunta a su spec.
- Toda feature o cambio lleva tests de comportamiento real.
- No marcar nada como terminado sin `check` en verde + aprobación escrita del revisor en `progress/`.
- No tocar secretos, `.env`, ni hacer push o deploy sin que lo pidan.
- Si un comportamiento cambia, actualizar su spec en el mismo cambio.
- Restricciones del brief que no se negocian en código: solo spot, solo BSC mainnet, al menos uno de bStocks / Ondo / xStocks. La demo firma con unos pocos dólares propios; hasta esa tarea, simular con la Transaction API.

## Forma de trabajo en git

- `main` está protegido: no se pushea directo ni se fuerza. Todo entra por pull request con 1 aprobación y el check `check` (CI) en verde.
- Una rama corta por tarea del tablero, desde `main` actualizado: `tipo/descripcion-corta` (`feat/`, `fix/`, `docs/`, `chore/`, `test/`).
- Pull requests chicos, unidos el mismo día o el siguiente. Una rama que vive más de dos días es la que termina en conflicto.
- Se une solo con squash; la rama se borra sola al unir.
- El pull request dice qué tarea del tablero cierra (`Closes #N`) y su spec, si la tiene.

## Dónde trabaja cada parte

- **Lógica**: `lib/evaluate.ts`. La decisión de las preguntas 1 y 2. Los tests están en `tests/evaluate.test.ts`.
- **Pantalla**: `app/`. Consume el resultado de `evaluate` y no vuelve a decidir el corte. Los cinco estados de ejemplo están en `lib/evaluation-examples.ts`.
- **APIs de Binance**: todavía no existen. Cuando se agreguen, traducen la respuesta oficial a la entrada de `evaluate`. La key no entra al browser.

## Particularidades

- La home que vino con la plantilla sigue cubierta por `specs/example.md` hasta que la pantalla de producto la reemplace.
- Primera vez: `npm ci` y `npx playwright install` (navegadores e2e).
- Variables de entorno: copiar `.env.example` a `.env` (el `.env` real nunca se commitea).
