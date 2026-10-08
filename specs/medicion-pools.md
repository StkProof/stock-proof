# Spec: medición propia de la dispersión entre pools

- **Estado**: aprobada (Agustín, 7 oct 2026). Datos en `~/Escritorio/projects/hacka-bnb/mediciones/`.
- **Fecha**: 2026-10-07
- **Autor**: Agustín, con agente (Cursor)
- **Issue**: #13 (precio por pool). Hallazgos previos en el comentario del 7 oct 2026 de ese issue.

## Contexto y problema

La pregunta 4 corta si «los pools del mismo ticker no coinciden» (`Idea.md`), con `POOLS_DIVERGENCE_LIMIT = 0.001` (0,1 %) en `lib/thresholds.ts`. Ese 0,1 % sale del estudio de Bitquery (`Dolores.md` §5): QQQB discrepa 0,012 % entre pools y SPCX 0,239 %, medido sobre un mes de operaciones. En vivo, `poolsDiffRatio` nunca llega: no hay fuente conectada.

El 7 oct 2026, con la rueda de EE. UU. cerrada, se midió con fuentes reales:

| Medida | QQQB (líquido) | SPCXB (fino) |
| --- | --- | --- |
| Precio actual de los dos pools grandes contra dólares (RPC) | 0,317 % | 0,166 % |
| Precio de operaciones por venue, último minuto (`trades`) | 0,183 % | 0,248 % |
| Precio de operaciones por venue, últimos 5 minutos | 0,097 % | 0,295 % |

Una foto del momento no separa el nombre líquido del fino: con el tope de 0,1 %, QQQB cortaría o pasaría según el minuto. Antes de conectar la pregunta 4 hay que medir durante días, con rueda abierta, cerrada y fin de semana, y elegir con datos qué medida y qué tope separan los dos casos.

`specs/registro-llamadas.md` deja «la tarea programada que consulta en horarios fijos» para una spec propia, después de chequear los límites de uso. Esta es esa spec. Límite medido el 7 oct 2026 con la key del equipo: `x-oc-ratelimit-limit = 5` por ventana de alrededor de un segundo y `x-oc-used-weight = 1` por llamada a `trades`. La Market API no publica cobro por uso.

## Comportamiento esperado

Un script, `npm run medir:pools`, que corre en primer plano hasta que se lo corta o se cumple la duración pedida.

1. **Tokens.** Al arrancar resuelve, con la lista pública (`listStockTokens`), los contratos en BSC de los tickers pedidos para los tres wrappers. Por defecto: QQQ y SPY (índices líquidos), NVDA (acción líquida) y SPCX (nombre fino). Un ticker sin contrato en un wrapper se anota y se saltea.
2. **Cada 5 minutos**, por cada token:
   - `GET /api/v1/dex/market/trades` (`binanceChainId=56`, `limit=100`), paginando hacia atrás con el `cursor` que devuelve cada página hasta llegar al fill más nuevo de la ronda anterior (en la primera ronda, 5 minutos antes), con un tope de 10 páginas (1.000 fills) por token y ronda. Si se llega al tope sin alcanzar la ronda anterior, la línea queda con `tradesTruncated: true`; la cantidad de páginas queda en `tradePages`. Los fills del borde pueden repetirse entre rondas: el análisis deduplica. Se guarda cada operación con lo que hace falta para el análisis: `txHash`, `dexName`, `type`, `volume` (USD), la cantidad del token y el símbolo y el contrato de la contraparte, y `time`. El precio en USD de cada operación es `volume / cantidad del token`; el `price` de la API viene en la moneda de la contraparte y no se usa.
3. **Cada hora**, por cada token: `GET /api/v1/dex/market/token/top-liquidity`. Por cada pool con dirección de 20 bytes y `liquidityUsd` no nulo, el precio actual se lee por RPC de BSC (`slot0` en V3; `getReserves` en V2, según cuál responda), en pedidos JSON-RPC por lote de hasta 20 llamadas: el nodo público rechaza entero un lote de 40 (medido el 7 oct 2026). El precio queda en la moneda de la contraparte del pool (USDT, WBNB…), con su contrato.
4. **Estado de mercado**: una lectura de `getMarketStatus` por ronda, guardada con la ronda.
5. **Salida**: una línea JSON por token y por ronda en `STOCKPROOF_MEDICION_DIR/pools-AAAA-MM-DD.jsonl` (fecha UTC del inicio de la ronda), con la hora de la ronda, el ticker, el wrapper, el contrato, el estado de mercado, las operaciones y, en las rondas horarias, los pools con su precio y liquidez. Datos crudos, sin agregar: la medida se elige después.
6. **Registro de llamadas**: toda llamada a Binance sale por `binanceRequest`, con `STOCKPROOF_CALLER=medicion` y `context.purpose = "medicion-pools"`. `STOCKPROOF_LOG_DIR` apunta fuera del repo.
7. **Ritmo**: las llamadas firmadas salen de a una, con al menos 500 ms entre una y otra (como mucho 2 por segundo, menos de la mitad del límite). Con los 12 tokens por defecto, entre 160 y unas 400 llamadas por hora según cuánto se opere (aprobado por Agustín el 7 oct 2026, al ver que 100 fills de QQQB cubrían menos de un minuto).
8. **Freno**: con HTTP 429 o el código de límite de la API (`100004`), espera `retry-after` (o 60 s si no viene) y reintenta una vez. Con tres respuestas de límite seguidas, termina con código distinto de 0 y lo dice. Un error de una llamada que no es de límite se anota en la línea del token y la ronda sigue.

## Criterios de aceptación

- [ ] El precio en USD de una operación sale de `volume / cantidad del token`, con el contrato del token comparado sin importar mayúsculas; una operación sin el token, con cantidad 0 o con números rotos queda afuera (unitario, con una respuesta real de `trades` como fixture).
- [ ] El precio de un pool V3 sale de `sqrtPriceX96` con los decimales y el orden de los tokens, y el de un pool V2 de las reservas; con el token como `token0` y como `token1` (unitario, con valores leídos el 7 oct 2026).
- [ ] Ante un 429 se espera `retry-after` o 60 s; a la tercera respuesta de límite seguida el script termina con código distinto de 0 (unitario, con `fetch` y reloj simulados).
- [ ] Dos llamadas firmadas nunca salen a menos de 500 ms (unitario, con reloj simulado).
- [ ] Toda llamada a Binance pasa por `binanceRequest` y queda en el registro con `caller: "medicion"` (unitario).
- [ ] Una corrida corta real (`--duracion 10m`) escribe líneas válidas para los 12 tokens y ninguna toca el repo (`git status` limpio después).
- [ ] `npx -p node@20 npm run check` en verde.

## Casos borde

- La máquina se suspende o pierde la red: la ronda que falla se anota con su error (`roundError` si falla entera) y la siguiente sigue. Para la corrida larga, `systemd-inhibit --what=sleep:idle` evita la suspensión.
- Un error a mitad de la paginación: la línea guarda los fills ya leídos y el motivo en `tradesError`. Los huecos se ven por la hora de cada ronda. Como la ronda siguiente pagina hasta el último fill visto, recupera lo que entre en sus 10 páginas; lo que no, queda como hueco (`tradesTruncated: true`).
- Un token sin operaciones en la ventana (xStocks suele tener horas sin fills): la línea sale con `trades: []`. No es un error.
- `top-liquidity` con pools en `liquidityUsd: null` (venues RFQ: Bebop, Native, xChange): se guardan en la lista con `price: null`, sin leer por RPC. Es el caso de todos los tokens Ondo y xStocks medidos el 7 oct 2026: en BSC solo cotizan por RFQ, así que para ellos solo hay operaciones.
- Una dirección de pool de 32 bytes (Uniswap V4 es un id, no un contrato): se guarda en la lista con `price: null`, sin leer por RPC.
- Una carpeta de datos o de registro dentro del repo: el script no arranca.
- Un pool cuyo `slot0` y `getReserves` fallan los dos: se guarda con `price: "unavailable"`.

## Fuera de alcance

- El análisis de los datos, la elección de la medida y del tope, y su registro en `Fuentes.md`. Va en la tarea siguiente, con su propia spec.
- Conectar la pregunta 4 a esta fuente y cambiar `POOLS_DIVERGENCE_LIMIT`.
- Que el script sobreviva a un reinicio de la máquina o corra en un servidor: se corre a mano con `nohup`.
- Medir cotizaciones de compra o venta (Trading API). Esta tarea mide solo operaciones y pools.

## Decisiones técnicas

- **Datos crudos, no agregados.** La medida todavía no está decidida (mediana por venue, punto medio entre compras y ventas, ventana de 1 o 5 minutos, solo pools contra stablecoins). Guardar las operaciones deja elegir después sin volver a medir.
- **`trades` como fuente principal, RPC como contraste.** `trades` mide lo mismo que Bitquery (operaciones reales por venue), es una API del brief y cubre también los venues RFQ. El precio de cada pool por RPC queda una vez por hora, para comparar las dos medidas.
- **El adaptador de `trades` va en `lib/binance/` y el cálculo de precios de pool en `lib/chain/`.** Si la tarea siguiente conecta la pregunta 4, los reutiliza; el script solo orquesta.
- **Paginar en vez de bajar el intervalo.** El 7 oct 2026, con la rueda cerrada, 100 fills de QQQB cubrían 47 segundos y los de NVDAB y SPCXB entre 2 y 4 minutos. Pedir más seguido no alcanza y gasta igual; el `cursor` pesa 1 por página y trae solo lo que falta.
- **Los datos y el registro, fuera del repo.** Con 12 tokens son entre 3.800 y unas 9.600 llamadas por día. El registro guarda hasta 20 KB por línea y crecería decenas de MB por día en un archivo que está en git. Las dos carpetas se pasan por variable de entorno; sin ellas el script no arranca.
- **Por defecto, 4 tickers × 3 wrappers.** QQQ y SPY repiten la escena líquida de `Dolores.md`; NVDA agrega una acción líquida que no es índice; SPCX es el nombre fino del vault. Los tres wrappers dejan ver si Ondo y xStocks tienen datos para comparar o quedan «sin dato».

## Dependencias

- La key del equipo en el entorno (`BINANCE_API_KEY` y su firma). Sin key, el script no arranca.
- `listStockTokens` y `getMarketStatus` (`lib/binance/rwa-public.ts`), y `binanceRequest` (`lib/binance/request.ts`), ya en `main`.

## Estimación y slices

Estimado en 450 líneas; quedaron unas 1.400 contando tests y fixtures reales (la paginación y la lectura por lotes se sumaron después de la primera corrida real). Un solo PR: el adaptador, el cálculo de precio de pool y el script se prueban juntos con la corrida corta real.
