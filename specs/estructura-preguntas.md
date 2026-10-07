# Spec: una pregunta por archivo, `evaluate` solo orquesta, umbrales en un solo archivo

- **Estado**: aprobada (Agustín, 7 oct 2026)
- **Fecha**: 2026-10-07
- **Autor**: Agustín, con agente (Cursor)
- **Issue**: #3

## Contexto y problema

`Plan.md` (vault, «Dónde nos podemos pisar») fija dos reglas que el código todavía no cumple:

1. **`evaluate.ts` solo llama a las preguntas en orden.** Las preguntas 3 y 4 ya viven en `lib/questions/`, pero `evaluate.ts` (617 líneas) sigue decidiendo por su cuenta:
   - la pregunta 2 entera: la compuerta de compra, la de venta (Exit Now), el ganador entre firmables y el desempate (`lib/evaluate.ts:336-388`);
   - el corte de la pregunta 1 cuando ninguna cotización es auténtica: «sin verificar» contra «impostor», y el motivo del que hubiera ganado (`:289-334`);
   - el `Reference` que la pantalla muestra para la pregunta 3 (`buildReference`, `:571-592`);
   - los topes de la frase (`checkConstraints`, `:594-617`).
2. **Ningún número suelto: los umbrales viven en un solo archivo.** Hoy están repartidos: `IMPACT_LIMIT` en `lib/evaluate.ts:12`, `POOLS_DIVERGENCE_LIMIT` en `lib/questions/q4.ts:10`, `FLOAT_TOLERANCE` en `lib/questions/q3.ts:9`. Además, la pantalla repite «1%» a mano en dos textos (`components/messages.ts:29,31`). Si alguien cambia el umbral, esos textos mienten.

El riesgo de dejarlo así: Lautaro y Agustín se pisan en `evaluate.ts`, y un umbral cambiado en un lugar no cambia en los otros.

## Comportamiento esperado

**Ningún resultado cambia.** Para cualquier entrada, `evaluate` devuelve exactamente lo mismo que hoy. Lo que cambia es dónde vive cada decisión:

| Qué | Hoy | Después |
| --- | --- | --- |
| Umbrales (`IMPACT_LIMIT`, `POOLS_DIVERGENCE_LIMIT`, tolerancia de «mismo precio») | `evaluate.ts`, `q4.ts`, `q3.ts` | `lib/thresholds.ts`, con el motivo y la fuente de cada número |
| Pregunta 1 sobre el contrato pegado y sobre las cotizaciones | `evaluate.ts` | `lib/questions/q1-gate.ts`: `checkTarget` (contrato pegado, antes de validar las cotizaciones) y `decideQuestion1` (cotizaciones) |
| Pregunta 2: compuerta doble, ganador y empate | `evaluate.ts` | `lib/questions/q2.ts` (`decideQuestion2`) |
| Códigos de la pregunta 2 (`Q2_CUT_REASONS`) | `evaluate.ts` | `lib/questions/q2-reasons.ts`, como las preguntas 1, 3 y 4 |
| `Reference` de la pregunta 3 | `evaluate.ts` | `lib/questions/q3.ts` (`buildReference`) |
| Topes de la frase | `evaluate.ts` | `lib/questions/constraints.ts` (`checkConstraints`) |
| «1%» en los textos de corte | escrito a mano | sale de `IMPACT_LIMIT` |

`evaluate.ts` se queda con los tipos de la evaluación (el formato congelado), la validación de la entrada (`invalid`, `normalizeQuotes`, `normalizeExits`) y el orden: pregunta 1, pregunta 2, pregunta 3, pregunta 4, topes y bloque de salida.

Cada función nueva es pura: no llama a la red y no completa datos que no llegaron.

## Criterios de aceptación

- [x] Los 219 unitarios y los 25 e2e actuales pasan sin cambiar ninguna aserción. Solo cambian rutas de `import` (`npx -p node@20 npm run check`).
- [x] `decideQuestion2` tiene unitarios propios: compra sobre el tope (`IMPACT_OVER_LIMIT`), venta medida sobre el tope (`EXIT_OVER_LIMIT`), venta sin medir (`EXIT_NOW_UNAVAILABLE`), gana el siguiente firmable cuando el más barato no puede salir, y empate entre firmables por el orden bStocks → Ondo → xStocks (`tests/q2.test.ts`).
- [x] `checkTarget` y `decideQuestion1` tienen unitarios propios: contrato pegado sin verificar, contrato pegado impostor, todas las cotizaciones impostoras con el motivo del de menor impacto, y una sin verificar que gana sobre los impostores (`tests/q1-gate.test.ts`).
- [x] Los textos de `IMPACT_OVER_LIMIT` y `EXIT_OVER_LIMIT` dicen el porcentaje de `IMPACT_LIMIT`. Un test fija que el texto contiene «1%» y que sale del umbral, no del literal (`tests/messages.test.ts`).
- [x] Fuera de `lib/thresholds.ts` no queda ningún umbral numérico en `lib/` ni en `components/messages.ts`. Se comprueba con `rg` en la revisión, sobre los nombres y los literales `0.01`, `0.001` y `1e-9`.
- [x] `lib/evaluate.ts` no compara impactos ni precios: solo llama a `checkTarget`, `decideQuestion1..4`, `buildReference` y `checkConstraints` (revisión del diff).

## Casos borde

- **Importación circular.** `q2.ts` necesita el orden `WRAPPERS` (un valor) y los tipos de `evaluate.ts`, y `evaluate.ts` importa `q2.ts`. Los tipos van con `import type`. `WRAPPERS` se usa solo dentro de funciones, así que el ciclo no rompe en tiempo de carga. Si algún test lo muestra roto, `WRAPPERS` pasa a un archivo propio (`lib/wrappers.ts`) en el mismo cambio.
- **`IMPACT_LIMIT` se importa desde `lib/evaluate`** en `tests/evaluate.test.ts` y `tests/exit-now.test.ts`. Se cambia la ruta a `lib/thresholds`. No queda reexportado desde `evaluate.ts`: dos lugares para el mismo número es justo lo que esta tarea saca.
- **El porcentaje del texto.** `IMPACT_LIMIT * 100` con un umbral como `0.007` da `0.7000000000000001`. `formatPercent` (`lib/format.ts`) tampoco sirve: da «1,00 %», con decimales y un espacio que cambian el texto actual. El número se arma con `toLocaleString("es-AR", { maximumFractionDigits: 2 })` y se le pega «%»: da «1%» hoy y «0,7%» con `0.007`.

## Fuera de alcance

- Cambiar el valor de cualquier umbral.
- La fuente de precios por pool para la pregunta 4 (issue #13): `poolsDiffRatio` sigue sin llegar en vivo.
- Exit Risk (issue #19).
- Mover los tipos de la evaluación fuera de `evaluate.ts`. Son el formato congelado de la ola 0 y moverlos toca a los tres.
- El cliente de las APIs (`lib/binance/`) y el orquestador (`lib/evaluation-input.ts`). Las constantes de API (URLs, `chainId`, decimales de USDT, límites del log) son parámetros del protocolo, no umbrales de decisión: se quedan donde están.

## Decisiones técnicas

- **Un archivo de umbrales en `lib/`, no un JSON ni variables de entorno.** Con TypeScript cada número trae su comentario con la fuente (`Dolores.md`, `Idea.md`), y el tipo lo controla el compilador. Por entorno se podría cambiar el corte sin revisión, y la regla es que el corte no se negocia.
- **La tolerancia de «mismo precio» de la pregunta 3 también va a `lib/thresholds.ts`.** No es un umbral de desvío (la regla del vault no fija porcentaje), pero es un número que decide pasa o corta. Va con su comentario actual, que explica que solo absorbe el error de punto flotante.
- **`decideQuestion2` devuelve el ganador o el motivo; `evaluate` arma el resultado.** Las preguntas 3 y 4 ya siguen ese patrón: la pregunta decide y `evaluate` decora el resultado con `quotes`, `exits` y `quoteGaps`. Así el formato del resultado sigue en un solo lugar.
- **Sin reexportar desde `evaluate.ts`.** Cada constante se importa desde su archivo. Cuesta cambiar unas pocas rutas en los tests, pero deja un solo dueño por número.
- **No se cambian aserciones de tests existentes.** Es la prueba de que el comportamiento no cambió. Los tests nuevos prueban las funciones extraídas por separado: la próxima persona que toque una pregunta lo hace sin pasar por `evaluate`.

## Dependencias

- Ninguna abierta. Las preguntas 3 y 4, Exit Now y Exit Availability ya están en `main` (#39 a #45).

## Estimación y slices

Unas 400 líneas, la mitad en tests nuevos. Un solo PR: partirlo deja un `main` intermedio con la mitad de los umbrales movidos, que es el estado que esta tarea quiere sacar.
