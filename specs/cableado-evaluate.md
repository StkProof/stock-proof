# Spec: cableado de las preguntas 3 y 4 y Exit Now en `evaluate`

- **Estado**: aprobada (Agustín, 3 oct 2026, al pedir el merge del PR #45). Las dos preguntas abiertas siguen abiertas para otra tarea.
- **Fecha**: 2026-10-03
- **Autor**: Agustín, con agente (Cursor)
- **Issue**: N/A — sigue a #15 (pregunta 3), #16 (pregunta 4), #17 (Exit Now) y #18 (Exit Availability), ya cerradas. Esas tareas dejaron cada pieza como función suelta y probada; esta las conecta a `evaluate` y al orquestador.

## Contexto y problema

En `main` existen `decideQuestion3`, `decideQuestion4`, `quoteExitNow` y `buildExitAvailability`, pero `evaluate` no las llama. La pregunta 3 y la 4 llegan como datos que se muestran sin cortar, y el bloque de salida queda en «sin dato» porque `buildEvaluateInput` manda `exit: "unavailable"`. Así la pantalla puede decir «se puede firmar» con un desvío sin explicar, con pools que no coinciden o sin haber medido la venta.

La regla del vault del 30 sep 2026 (`Idea.md`, `Diferenciador.md`) fija tres cosas que este cambio hace cumplir:

1. Las cuatro preguntas corren en orden y cualquier corte frena la firma.
2. La venta del mismo monto (Exit Now) es compuerta, al mismo nivel que la compra. Si se pasa del tope o no se puede medir, no se firma.
3. No se cambia de wrapper en silencio: si el candidato falla la 3 o la 4, el resultado lo nombra.

## Comportamiento esperado

### Orquestador (`buildEvaluateInput`)

1. Por cada wrapper que cotizó la compra, en paralelo:
   - la pregunta 1 sobre su contrato (sin cambios);
   - la venta del mismo monto (`exitNow`, `side: "sell"`). El `amount` es el `toTokenAmount` exacto que devolvió la compra, en unidades mínimas y como cadena (sin pasar por float), con la misma wallet del agente;
   - la disponibilidad de salida (`exitAvailability`), que informa;
   - los precios crudos de la pregunta 3 (`dynamic`): precio del token, precio del subyacente (`null` fuera de rueda) y `sharesMultiplier`.
2. Cada llamada que falla queda `"unavailable"` para ese wrapper; no tumba al resto.
3. `market/status/ai` se lee una sola vez por evaluación: lo usan la pregunta 4 y la disponibilidad de cada wrapper.
4. La entrada de `evaluate` suma `exits: WrapperExit[]` (uno por wrapper que cotizó) y `reference: Q3Input[]`. El campo `exit` global desaparece de la entrada.

### `evaluate`

1. Pregunta 1: sin cambios.
2. Pregunta 2, compuerta doble. Un wrapper se puede firmar solo si la compra (`impactRatio`) **y** la venta medida (`exits[].now.costRatio`) están en `IMPACT_LIMIT` (1%) o menos.
   - Ninguna compra entra: `cut` con `IMPACT_OVER_LIMIT` (sin cambios).
   - Alguna compra entra, pero ninguna tiene venta firmable y al menos una venta se midió por encima del tope: `cut` con `EXIT_OVER_LIMIT`.
   - Alguna compra entra, pero ninguna venta se pudo medir: `unavailable` con `EXIT_NOW_UNAVAILABLE` (fail closed).
   - El ganador es el de menor impacto de compra **entre los firmables**. El desempate sigue el orden bStocks → Ondo → xStocks, y `tied` se mide solo entre los firmables.
3. Pregunta 3 sobre el ganador, con `decideQuestion3`: un corte da `cut` de la pregunta 3 con `DEVIATION_UNEXPLAINED`, y un precio faltante da `unavailable` con `TOKEN_PRICE_UNAVAILABLE` o `REFERENCE_PRICE_UNAVAILABLE`. El resultado nombra el `wrapper` candidato; no se prueba con el siguiente.
4. Pregunta 4 sobre el régimen, con `decideQuestion4`: el único corte es `POOLS_DISAGREE`. Sin datos de régimen, la pregunta queda «sin dato» y no corta. El mercado cerrado no corta.
5. `pass`: `exit` es la salida del ganador (`now` y `availability`); `risk` sigue `"unavailable"` (issue #19).
6. `exits` viaja en `pass`, en los `cut` de las preguntas 2, 3 y 4, y en los `unavailable` posteriores a la cotización, para que la pantalla compare entrada y salida por wrapper.

### Pantalla

1. La tabla de cotizaciones suma la columna «Salida ahora» cuando hay `exits`: lo recuperado y su costo, o «sin dato» si la venta no se midió.
2. Los cortes de las preguntas 3 y 4 nombran al emisor candidato.
3. `messages.ts` suma textos para `EXIT_OVER_LIMIT`, `EXIT_NOW_UNAVAILABLE`, los motivos de la pregunta 3 y `POOLS_DISAGREE`.
4. Escena nueva `cutExitNow` (SPCXB, US$ 2.000): la compra entra y la venta medida supera el tope.

Las specs hermanas quedan actualizadas en el mismo cambio: `formato-evaluacion.md` (entrada, resultado y reglas del bloque de salida), `preguntas-1-y-2.md` (la 2 pasa a «entra y sale»), `conexion-datos.md` (orquestador) y `cotizaciones-parciales.md` (ganador entre firmables).

## Criterios de aceptación

- [x] Compra bajo el tope y venta medida sobre el tope en todos los candidatos: `cut` de la pregunta 2 con `EXIT_OVER_LIMIT` y `exits` en el resultado (unitario `tests/evaluate.test.ts`).
- [x] Compra bajo el tope y ninguna venta medida: `unavailable` de la pregunta 2 con `EXIT_NOW_UNAVAILABLE` (unitario `tests/evaluate.test.ts`).
- [x] El de menor impacto de compra no puede salir: gana el siguiente firmable, y el empate solo cuenta entre firmables (unitario `tests/evaluate.test.ts`).
- [x] Desvío sin causa en el ganador: `cut` de la pregunta 3 con el `wrapper` candidato; precio faltante: `unavailable` de la pregunta 3 (unitario `tests/evaluate.test.ts`).
- [x] Pools que no coinciden: `cut` de la pregunta 4; régimen ausente no corta (unitario `tests/evaluate.test.ts`).
- [x] La venta se cotiza con el `toTokenAmount` exacto de cada compra y la wallet del agente; una venta que falla queda `"unavailable"` sin tumbar al resto; `market/status` se lee una vez (unitario `tests/evaluation-input.test.ts`).
- [x] `toTokenAmount` se conserva como cadena exacta, sin pasar por float (unitario `tests/trading.test.ts`).
- [x] La pantalla muestra la columna «Salida ahora» y el corte por la venta con el costo medido, sin botón de firma (e2e `e2e/pantalla.spec.ts`).
- [x] `npm run check` en verde.

## Casos borde

- Venta con un `now` malformado (números no finitos o sin `simulatedAt`): cuenta como no medida.
- `exits` con un wrapper desconocido o repetido: se ignora; vale la primera entrada.
- Un wrapper que cotizó la compra pero cuya venta falló: queda `now: "unavailable"` y no firma, aunque otro sí pueda.
- La compra de un wrapper falla: no se pide su venta (no hay `toTokenAmount`) y queda como `quoteGap`.
- Fuera de rueda Binance manda el precio del subyacente en `null`: la pregunta 3 queda `REFERENCE_PRICE_UNAVAILABLE` y no se firma (ver la primera pregunta abierta).
- Sin credenciales de firma no hay compra ni venta: `QUOTES_UNAVAILABLE`, igual que antes.

## Fuera de alcance

- Devolver «el monto que sí se puede vender» cuando la venta corta (`Diferenciador.md`). Hacerlo exige otra cotización real de venta; no se estima por regla de tres ni se cotiza en loop. Queda para otra tarea (segunda pregunta abierta).
- Exit Risk (issue #19): `exit.risk` sigue `"unavailable"`.
- Medir la divergencia de pools y el libro clavado en vivo: `Q4Input` ya los admite, pero falta la fuente.
- La firma real y la negativa del agente (issue #22).
- Los textos que agrega PR #44 (`specs/textos-motivo-y-frase.md`): si se une primero, este cambio se rebasa sobre él.

## Decisiones técnicas

- **La salida viaja por wrapper (`exits`), no como un solo `exit` global.** La venta es compuerta de cada candidato: con un solo bloque no se puede elegir el ganador entre firmables ni nombrar qué venta cortó. El `exit` del `pass` es el del ganador. Alternativa descartada: medir solo la venta del ganador por compra, porque si esa venta corta habría que cambiar de wrapper en silencio.
- **La venta usa el `toTokenAmount` de la compra, como cadena.** Es exactamente lo que se compraría; `Number` pierde dígitos por encima de 2^53 en unidades mínimas de 18 decimales.
- **Las preguntas 3 y 4 corren solo sobre el ganador de la 2.** La regla de no cambiar de wrapper en silencio implica que un corte posterior frena, en lugar de buscar otro candidato.
- **Venta sin medir da `unavailable` y no `cut`.** No se midió nada sobre el tope; decir «corta» sería inventar el dato. Igual no se firma.
- **Una sola lectura de `market/status` por evaluación.** La pregunta 4 y la disponibilidad de cada wrapper leen el mismo endpoint; leerlo cuatro veces suma llamadas al log sin dato nuevo.

## Dependencias

- `decideQuestion3` (#42), `decideQuestion4` (#39), `quoteExitNow` (#41) y `buildExitAvailability` (#40), ya en `main`.
- La pantalla editorial (#43), ya en `main`: esta rama está rebasada sobre ella.

## Preguntas abiertas (se responden en la revisión)

1. **Fuera de rueda no se firma nada.** Con `referenceUsd: null` la pregunta 3 queda «sin dato» y, por fail closed, no hay firma. El vault quiere «QQQB un sábado firma con el libro clavado». ¿Se acepta así para esta tarea y se busca otra referencia (último cierre con su fecha) en una tarea aparte, o la pregunta 3 tiene que pasar con otra fuente antes de unir?
2. **«El monto que sí se puede vender».** El vault lo pide en el corte de Exit Now. ¿Va en una tarea aparte con una segunda cotización real de venta, como propone esta spec?

## Estimación y slices

Unas 1.200 líneas, más de la mitad en tests. No se parte en slices: la compuerta de la venta, la elección del ganador entre firmables y las preguntas 3 y 4 cambian la misma unión `Evaluation`. Separarlas dejaría un `main` intermedio que firma sin medir la venta.
