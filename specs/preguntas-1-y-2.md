# Spec: preguntas 1 y 2

- **Estado**: aprobada
- **Fecha**: 2026-09-27
- **Aprobación**: el usuario pidió asentar esta base para que el resto del equipo trabaje encima (27 sep 2026). La pantalla y las APIs reales quedan para ellos; esta aprobación cubre el contrato y `evaluate`.
- **Autor**: líder (Cursor), a partir de `../vault-stockproof/Idea.md` y `../vault-stockproof/MVP.md`

## Contexto y problema

Alguien escribe un ticker y un monto en dólares y está a punto de firmar un swap de una acción tokenizada en BSC. Dos fallas medidas llegan antes que el precio o el horario: el contrato que aparece no es el token oficial, y el monto no entra en el pool sin un impacto grande. Esta feature es la ventana del 26 sep al 3 oct: las dos primeras preguntas de StockProof. Si una falla, no hay transacción.

El detalle de producto está en el vault. Esta spec solo fija el comportamiento que el código tiene que cumplir.

## Comportamiento esperado

1. El usuario escribe un ticker y un monto en dólares y pide la evaluación.
2. StockProof responde la pregunta 1 y, solo si pasa, la pregunta 2. En ese orden.
3. Pregunta 1 — «¿Este contrato es el real?». Se consulta la lista oficial y la attestation del ticker. Para bStocks, el token oficial cumple el estándar BEP-8056. Si el contrato no es el oficial, la pantalla corta: explica que falló la pregunta 1 y no arma la transacción.
4. Pregunta 2 — «¿Esta orden entra?». Se simula ese monto en bStocks, Ondo y xStocks. Si algún wrapper llena con impacto menor o igual al 1%, la pantalla muestra el wrapper de menor impacto, el costo simulado y que la pregunta pasó. El botón de firma queda visible pero no envía la transacción (la firma real es de la ventana siguiente).
5. Si los tres wrappers superan el 1% de impacto, la pantalla muestra el costo de cada uno, dice que falló la pregunta 2 y no arma la transacción.
6. Las respuestas se leen en castellano, en una sola pantalla.

## Reparto

El equipo son tres personas.

- **Frontend y producto** (una persona): la pantalla única, el texto en castellano y los estados que ve quien va a firmar. No decide si el contrato es real ni qué wrapper gana.
- **Lógica** (las otras dos, juntas): la función que responde las preguntas 1 y 2, y más adelante los adaptadores a las APIs de Binance. No dibuja la pantalla.

Las dos partes se encuentran en el resultado de `evaluate`. La pantalla puede avanzar con resultados fijos de esa función mientras la lógica no llama todavía a Binance.

## Contrato entre pantalla y lógica

`evaluate` es una función pura. Recibe datos ya traídos (o la marca de que no se pudieron traer) y devuelve un resultado. No hace fetch.

Entrada:

- `ticker`: texto.
- `amountUsd`: número.
- `authenticity`: `{ listed, attested, standardOk }` o `"unavailable"`.
- `quotes`: una cotización por cada wrapper (`bstocks`, `ondo`, `xstocks`) que cotizó, cada una con `impactRatio` (0.01 = 1%) y `simulatedCostUsd`, o `"unavailable"` cuando no llegó ninguna. Los wrappers sin cotización viajan aparte en `quoteGaps` con su motivo (`specs/cotizaciones-parciales.md`).

Resultado, uno solo:

| `kind` | Cuándo | Qué muestra la pantalla |
| --- | --- | --- |
| `invalid` | Ticker vacío o monto que no es un número positivo | Pide corregir la entrada. No hay costos ni botón de firma |
| `unavailable` | La lista no se pudo obtener o no llegó ninguna cotización | Dice que no se pudo evaluar. No inventa un precio ni arma la transacción |
| `cut` pregunta 1 | El ticker no está en la lista, no tiene attestation, o no cumple el estándar (BEP-8056 en bStocks) | Explica el corte. No muestra costos ni botón de firma |
| `cut` pregunta 2 | Todos los impactos disponibles superan 1% | Muestra los costos que llegaron, qué venue no cotizó y el corte. No hay botón de firma |
| `pass` | Algún wrapper está en 1% o menos | Nombra el wrapper de menor impacto, el costo simulado y, si hubo empate, que empató. El botón de firma se ve y no envía la transacción |

El desempate, de menor a mayor prioridad solo cuando el impacto es igual: bStocks, Ondo, xStocks. `pass.tied` es verdadero cuando otro wrapper igualó ese impacto.

La pregunta 1 se evalúa antes que la 2. Si la 1 corta, las cotizaciones no cambian el resultado.

## Criterios de aceptación

- [ ] Con un ticker cuyo contrato no está en la lista oficial, la pantalla muestra el corte de la pregunta 1 y no muestra costo de swap ni botón de firma (cómo se comprueba: e2e con la lista oficial sustituida por un doble de test).
- [ ] Con un ticker oficial y un monto que un solo wrapper llena a ≤ 1% de impacto, la pantalla nombra ese wrapper y el costo simulado, y no arma una transacción (cómo se comprueba: e2e con cotizaciones sustituidas por un doble de test).
- [ ] Con un ticker oficial y un monto que todos los wrappers que cotizaron superan el 1%, la pantalla muestra sus costos y el corte de la pregunta 2, sin botón de firma (cómo se comprueba: e2e con el mismo doble).
- [ ] La decisión «pasa / corta» y el wrapper elegido son una función pura de la lista, la attestation y las simulaciones disponibles, independiente de la UI (cómo se comprueba: unitario sobre esa función, con los tres casos de arriba más el desempate de impacto).
- [ ] `npm run check` sigue en verde.

## Casos borde

- Ticker vacío o monto que no es un número positivo: la pantalla pide corregir la entrada y no llama a las APIs.
- La lista oficial no conoce el ticker: se trata como pregunta 1 fallida (no es el contrato real).
- Dos wrappers empatan en impacto y ambos están ≤ 1%: se muestra uno y se nombra el empate. El orden de desempate queda fijado en el unitario (bStocks, después Ondo, después xStocks) porque el vault no lo especifica.
- Una API no responde o responde un error: la pantalla dice que no se pudo evaluar y no arma la transacción. No se inventa un precio.
- bStocks sin attestation o sin estándar BEP-8056: pregunta 1 fallida.

## Fuera de alcance

- Preguntas 3 y 4 (precio de referencia, multiplicador, mercado abierto o cerrado, libro clavado o disperso).
- Frase en castellano por Agentic Wallet, y cualquier firma o difusión en BSC mainnet.
- BNB Agent Studio, parqueo del stable en DeFi, y cobro por b402.
- Developer Experience Report y el video.
- Elegir un umbral distinto del 1% que ya está en el guion del vault («costo menor al 1%»).

## Decisiones técnicas

- Umbral de impacto 1%: es el corte que el propio MVP usa en la frase del agente. No se inventa otro.
- Las llamadas a Binance (RWA Data, Trading, Transaction) salen del servidor, no del browser: la API key no puede quedar en el cliente. Los nombres de endpoints se toman de la documentación oficial al implementar; esta spec no los inventa.
- La UI de esta ventana se prueba con un doble de las APIs. La integración contra las APIs reales es la tarea siguiente de lógica: la key del portal ya está, y vive en `.env` del servidor. Esa integración tiene su propia spec antes de codearse. Los nombres de endpoints salen de la documentación oficial.
- Desempate bStocks → Ondo → xStocks: el vault no define empate. Se fija acá para que el test sea estable. Si el usuario prefiere otro orden, se cambia la spec antes de implementar.
- El equipo se parte en pantalla y lógica sobre el mismo `evaluate`: así frontend no espera las API keys, y la lógica no espera el diseño de la pantalla.

## Checklist de la skill write-spec

- [x] Problema y contexto claros para alguien que no conoce la feature.
- [x] Cada criterio de aceptación tiene su forma de verificación.
- [x] Casos borde listados (no solo el camino feliz).
- [x] Fuera de alcance explícito (qué NO incluye).
- [x] Decisiones técnicas con su motivo.
