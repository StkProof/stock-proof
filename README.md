# StockProof

**StockProof**: dado un ticker y un monto, responde cuatro preguntas antes de firmar el swap de una acción tokenizada en BSC.

El porqué, el corte y el calendario están en el vault de este workspace (`../vault-stockproof/`). Este README solo dice cómo correr el código.

## Primera vez

```bash
npm ci
npx playwright install   # navegadores para el e2e
./init.sh                # verifica que el entorno esté sano
npm run check            # lint + typecheck + unitarios + e2e
npm run dev              # http://localhost:3000
```

## Dónde engancharse

La base de la semana 1 es `lib/evaluate.ts`: dado el ticker, el monto, la attestation y las tres cotizaciones, dice si se corta o qué wrapper pasa.

| Quién | Dónde | Qué no hace |
|---|---|---|
| Lógica | `lib/evaluate.ts` y `tests/evaluate.test.ts` | No dibuja la pantalla ni llama a Binance |
| Frontend / producto | `app/`, leyendo `lib/evaluation-examples.ts` | No reimplementa el corte |
| APIs | un adaptador futuro que arme la entrada de `evaluate` | No elige el wrapper por su cuenta |

## Contrato del harness

| Archivo | Para qué |
|---|---|
| `AGENTS.md` | Reglas del proyecto para los agentes |
| `init.sh` | Chequeo de entorno (no trabajar si falla) |
| `npm run check` | Validación oficial: todo en verde o no está terminado |
| `progress/` | Memoria de la tarea de este worktree |
| `specs/` | Una spec por feature no trivial |
