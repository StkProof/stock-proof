# Spec: pregunta 1, ¿este contrato es el real?

- **Estado**: borrador (falta la aprobación de Agustín)
- **Fecha**: 2026-09-28
- **Aprobación**: pendiente. Lautaro pidió implementarla en la misma rama (28 sep 2026). La aprobación de Agustín en el pull request aprueba juntos la spec, el ADR 0002 y la implementación
- **Autor**: Lautaro, a partir de `../vault-stockproof/Plan.md` (ola 1), `../vault-stockproof/Idea.md` y el ADR 0002 (`docs/adr/0002-pregunta-1-codigo-de-motivo.md`)
- **Issue**: #6

## Contexto y problema

La primera falla medida es que la gente compra un contrato que se llama igual y no es el token. En el vault hay 1.307 impostores bajo símbolos de bStocks, y dos copian el principio y el final de la dirección real. Hoy `evaluate` recibe la pregunta 1 resuelta en tres booleanos (`listed`, `attested`, `standardOk`), nadie los produce a partir de datos reales, y el corte no dice por qué. Sin ese motivo, la pantalla no puede explicar la escena 3 del video.

Esta spec fija la función que responde la pregunta 1 para **un contrato**: un ticker, un wrapper y una dirección en BSC. Devuelve si es el oficial y, si no, un código de motivo. No toca `evaluate.ts`. Ese cambio lo hace Agustín en su propio pull request (ADR 0002, Consecuencias).

## Comportamiento esperado

1. Quien llama pasa `ticker`, `wrapper` (`bstocks`, `ondo`, `xstocks`) y `address` (la dirección que va a usar la pregunta 2, o la que pegó el usuario).
2. Tres chequeos, en este orden. El primero que falla corta y los siguientes no se consultan:
   1. **Lista oficial.** RWA Data (`rwa/search?keyword=<ticker>`) tiene que devolver, para ese ticker, un token en `binanceChainId = "56"`, de la plataforma del wrapper (`bstock` para bStocks, `ondo` para Ondo), cuya `tokenContractAddress` es la dirección pedida.
   2. **Attestation.** `rwa/underlying-profile` de esa dirección en la chain 56 tiene que traer al menos un `protections.*` con `supported: true`.
   3. **Estándar.** Solo en bStocks: el contrato tiene que responder `true` a `supportsInterface(0xa60bf13d)` (BEP-677, EIP-8056 Scaled UI Amount) por `eth_call` en BSC. En Ondo no se exige.
3. Si los tres pasan, el resultado es `{ ok: true }`. Si no, es `{ ok: false, reason }`, con uno de los códigos de la tabla.
4. Si una fuente no responde, no se pasa. El resultado es un código de «no se pudo evaluar» (fail closed).
5. La función devuelve un código, no texto. El texto en castellano lo escribe Luciano (issue #21).

## Códigos de motivo

Están en `lib/questions/q1-reasons.ts`.

| Código | Cuándo | Tipo |
| --- | --- | --- |
| `TICKER_NOT_FOUND` | La búsqueda no devuelve ningún token de ese ticker en la chain 56 | corte |
| `CONTRACT_NOT_LISTED` | El ticker está, pero la dirección no es la oficial de ese wrapper en la chain 56 | corte |
| `ATTESTATION_MISSING` | La dirección es oficial, pero ninguna `protection` tiene `supported: true` | corte |
| `STANDARD_NOT_BEP8056` | bStock oficial que no responde `true` a `supportsInterface(0xa60bf13d)` | corte |
| `LIST_UNAVAILABLE` | La búsqueda no respondió, respondió error o una respuesta que no se entiende. También toda consulta de xStocks | no se pudo evaluar |
| `ATTESTATION_UNAVAILABLE` | `underlying-profile` no respondió, respondió error o una respuesta que no se entiende | no se pudo evaluar |
| `CHAIN_UNAVAILABLE` | El `eth_call` a BSC no respondió o respondió un error que no es un revert | no se pudo evaluar |

## Piezas

| Archivo | Qué hace | Red |
| --- | --- | --- |
| `lib/questions/q1-reasons.ts` | Los siete códigos y cuáles son «no se pudo evaluar» | No |
| `lib/questions/q1-authenticity.ts` | `decideAuthenticity`: la decisión pura sobre datos ya traídos | No |
| `lib/binance/rwa.ts` | `searchRwa` y `getUnderlyingProfile`. Salen por `binanceRequest` (ADR 0001) con `api: "rwa"` y `context: { purpose: "q1", ticker, wrapper }` | Binance |
| `lib/chain/supports-interface.ts` | `supportsInterface(address, interfaceId)` por `eth_call` a `BSC_RPC_URL` con `fetch`. No es Binance: no pasa por la puerta ni se anota | BSC |
| `lib/questions/q1.ts` | `checkContract`: trae lo necesario, en orden, y llama a `decideAuthenticity` | Por los dos de arriba |

La firma de las llamadas (`X-OC-SIGN`) es del cliente de Agustín (issue #2). `rwa.ts` la recibe como dependencia y no la implementa.

## Criterios de aceptación

- [ ] bStock oficial con attestation y BEP-8056 → `{ ok: true }` (unitario sobre `decideAuthenticity`).
- [ ] Ondo oficial con attestation y sin BEP-8056 → `{ ok: true }` (unitario).
- [ ] Ticker sin tokens en la chain 56 → `TICKER_NOT_FOUND` (unitario).
- [ ] Dirección que no es la oficial, incluida una que copia los primeros y últimos caracteres → `CONTRACT_NOT_LISTED`. La comparación es de la dirección completa, sin distinguir mayúsculas (unitario).
- [ ] Dirección oficial en otra chain, o de otro wrapper → `CONTRACT_NOT_LISTED` (unitario).
- [ ] Oficial sin ninguna `protection` en `supported: true` → `ATTESTATION_MISSING` (unitario).
- [ ] bStock oficial que responde `false` a `supportsInterface` → `STANDARD_NOT_BEP8056` (unitario).
- [ ] Si la lista corta, el resultado no depende de la attestation ni del estándar, y `checkContract` no los consulta (unitario sobre la decisión y sobre el orquestador con dobles).
- [ ] Lista, perfil o BSC no disponibles → `LIST_UNAVAILABLE`, `ATTESTATION_UNAVAILABLE`, `CHAIN_UNAVAILABLE`. Nunca `{ ok: true }` (unitario).
- [ ] xStocks → `LIST_UNAVAILABLE` sin llamar a Binance (unitario sobre el orquestador).
- [ ] `searchRwa` y `getUnderlyingProfile` traducen las respuestas de RWA Data (fixtures) a tipos propios, y un error HTTP, un `code` distinto de 0 o un cuerpo que no se entiende se vuelven `"unavailable"` (unitario con `fetch` sustituido).
- [ ] Cada llamada a RWA Data queda en el registro con `api: "rwa"` y `purpose: "q1"`, y la firma no aparece en la línea (unitario).
- [ ] `supportsInterface`: `0x…01` → `true`, `0x…00` → `false`, revert → `false`, respuesta vacía → `false`, error de red, HTTP o RPC que no es revert → `"unavailable"` (unitario con `fetch` sustituido).
- [ ] `.env.example` documenta `BSC_RPC_URL`.
- [ ] `npm run check` sigue en verde.
- [ ] Corrida real para QQQB (`{ ok: true }`) y para un impostor (`CONTRACT_NOT_LISTED` o `STANDARD_NOT_BEP8056`). **Queda para cuando haya key en `.env`**: los fixtures de hoy salen de la documentación y se reemplazan por respuestas reales en esa corrida.

## Casos borde

- Ticker con espacios o en minúsculas: se recorta y se compara sin distinguir mayúsculas.
- El ticker se puede escribir como el subyacente (`QQQ`) o como el símbolo del token (`QQQB`): cualquiera de los dos encuentra el resultado.
- La búsqueda devuelve otros tickers parecidos (`QQQ` y `QQQM`): solo cuentan los que coinciden exacto.
- Dirección con formato inválido (no es `0x` + 40 hex): `CONTRACT_NOT_LISTED`. No se llama a BSC.
- Un contrato común (BEP-20 sin ERC-165) suele hacer revert en `supportsInterface`: eso es «no cumple», no «no disponible».
- `protections` vacío o ausente en un perfil que respondió bien: `ATTESTATION_MISSING`.
- `underlying-profile` con `data: null`: `ATTESTATION_UNAVAILABLE` (no se sabe, no se pasa).

## Fuera de alcance

- Cambiar `evaluate.ts`, `lib/evaluation-examples.ts` o el formato de la evaluación (Agustín, PR aparte).
- El texto en castellano de cada código (Luciano, issue #21).
- Conectar `checkContract` a `evaluate` (30 sep, issue #9).
- La firma `X-OC-SIGN` y el cliente de las APIs (Agustín, issue #2).
- Leer el contenido o la fecha de los reportes de attestation.
- Una fuente oficial para xStocks.

## Decisiones técnicas

- Todas las decisiones de fondo están en el ADR 0002. Tres, además:
- `decideAuthenticity` recibe como `null` lo que no se consultó. Si el orden de corte llega a un chequeo cuyo dato es `null`, lo trata como «no disponible» (fail closed). El orquestador usa las mismas funciones de la decisión para saber qué consultar, así el orden vive en un solo lugar.
- El revert se reconoce por el código JSON-RPC `3` o por «revert» en el mensaje. Cualquier otro error del nodo es `CHAIN_UNAVAILABLE`.
- La URL base de RWA Data es `https://web3.binance.com/build`. El `requestPath` que se firma incluye `/build` y la query string (documentación de autenticación, consultada el 28 sep 2026).

## Checklist de la skill write-spec

- [x] Problema y contexto claros para alguien que no conoce la feature.
- [x] Cada criterio de aceptación tiene su forma de verificación.
- [x] Casos borde listados (no solo el camino feliz).
- [x] Fuera de alcance explícito (qué NO incluye).
- [x] Decisiones técnicas con su motivo.
