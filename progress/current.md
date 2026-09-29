# Tarea: Cotizaciones reales — wallet del agente, monto en wei, conjunto parcial

- Estado: en curso
- Spec: specs/cotizaciones-parciales.md (Estado: borrador — Agustín decidió las dos cosas que fija en la misma sesión, 28 sep 2026; aprueba en el pull request)
- Issues que cubre: #7 (cotización pregunta 2)
- Rama: `feat/cotizaciones-parciales`, sobre `main`
- Criterios de aceptación (de la spec):
  - [ ] `getAggregatedQuote` manda `userWalletAddress` cuando viene `walletAddress` y la firma cubre el query completo (unitario).
  - [ ] `amountUsd` entra al quote en unidades mínimas del token de pago, exacto y sin floats (`200` → `200e18`; `5.5` → `5.5e18`).
  - [ ] Con dos cotizaciones y una que falla, `buildEvaluateInput` devuelve las dos `quotes` y un `quoteGap` con su `reason` (unitario).
  - [ ] `evaluate` decide `pass`/`cut` con subconjunto de cotizaciones; con cero devuelve `unavailable` `QUOTES_UNAVAILABLE`; `quoteGaps` llega al resultado (unitario).
  - [ ] Wrapper sin contrato listado → `NOT_LISTED` sin llamar al quote; listado sin quote → `NO_QUOTE` (unitario).
  - [ ] `npm run check` en verde.
- Plan: `trading.ts` (wallet + doc de unidades) → `evaluation-input.ts` (`AGENT_WALLET_ADDRESS`, conversión exacta, gaps) → `evaluate.ts` (`QuoteGap`, `quoteGaps`, `normalizeQuotes` ≥1) → `.env.example` → tests → specs hermanas.
- Decisiones (Agustín, 28 sep 2026):
  - La wallet sale de `AGENT_WALLET_ADDRESS` en el `.env` del servidor; no se pide al usuario. Es la wallet del agente (la misma que ejecutaría el swap en la ola de firma).
  - Conjunto parcial con motivo: un venue sin quote entra como `quoteGap` (`NOT_LISTED` / `NO_QUOTE`) y no hunde la pregunta 2.
- Evidencia del sondeo en vivo (28 sep ~23:10 UTC, `logs/binance-calls-desconocido.jsonl`):
  - Sin `userWalletAddress`: Ondo/xStocks `40001` («required for RFQ»), bStocks `40374` con amount `"200"` (=200 wei).
  - Con wallet + `amount` en wei (`200 × 10^18`): bStocks y Ondo devuelven quote real (LiquidMesh, impacto 0.0006% y 0.0009%); Ondo cotiza desde 10 USD (`5e18` → `40375` mínimo). xStocks sigue `40374` para NVDA.
- Notas:
  - `quoteGaps` es aditivo: la pantalla actual lo ignora sin cambios; el texto para mostrarlo es área de Luciano.
  - Las líneas del sondeo quedan en el log (telemetría del DX report; la spec de registro las conserva).

## Revisión

**Veredicto: Aprobado.** Revisor: Devin (harness), 2026-09-29, sobre el working tree de `feat/cotizaciones-parciales`.

### Comandos corridos

- `git status` + `git diff` de todos los archivos tocados (implementador y líder).
- `npm run check` completo — **en verde**: eslint limpio, `tsc --noEmit` limpio, **131 tests unitarios** (10 archivos) y **7 e2e** de Playwright, todo en verde (~12 s).

### Criterios verificados contra código

- `getAggregatedQuote` (`lib/binance/trading.ts:83-84`): agrega `userWalletAddress` al `query` solo si `walletAddress?.trim()` es no vacío; el param entra al `queryString` que se firma (`requestPath`, línea 88-91) y a la URL fetch — la firma cubre el query completo. `amount` documentado como unidades mínimas del `from` token (línea 65).
- Conversión exacta `toMinimalUnits` (`trading.ts:24-40`): cadena + `BigInt`, sin floats; expande notación exponencial y trunca (slice) en vez de redondear. Verificado: `200` → `"200000000000000000000"`, `5.5` → `"5500000000000000000"`, `1.9e-19` → `"0"` (trunca).
- `realInputDeps` (`evaluation-input.ts:73`): `AGENT_WALLET_ADDRESS` con trim, `undefined` si ausente/vacía.
- `buildQuotes` (`evaluation-input.ts:189-220`): wrapper sin contrato → `NOT_LISTED` **sin llamar** a `sources.quote`; quote `"unavailable"` → `NO_QUOTE`; `checkContractSources` (pregunta 1) corre **solo** sobre contratos que sí cotizaron; `simulatedCostUsd` sigue en USD (línea 213). `buildEvaluateInput` emite `quotes: "unavailable"` con cero cotizaciones y `quoteGaps` solo cuando hay gaps (líneas 104-106).
- `evaluate` (`lib/evaluate.ts`): tipo `QuoteGap` nuevo; `quoteGaps?` en `EvaluateInput` y propagado a `unavailable` (q1 y q2), `cut` q1 y q2, y `pass` — las variantes que exponen cotizaciones. `normalizeQuotes` acepta ≥1 válida (`byWrapper.size === 0` → null), sigue dedupe, validación por campo (suma rechazo de wrapper desconocido, fail closed) y orden estable `bstocks → ondo → xstocks`.
- Aditivo: `git diff --name-only` confirma **cero cambios en `app/` y `components/`**; los e2e de pantalla pasan sin tocar. `Evaluation` solo suma campos opcionales.
- Secretos: `git diff logs/` solo agrega líneas de sondeo con `params` públicos (la wallet `0xcB9f...` es address on-chain, dato público según la spec); no hay API keys ni headers. `.env.example` documenta `AGENT_WALLET_ADDRESS` como opcional.

### Tests revisados — verifican comportamiento real, no humo

- `trading.test.ts`: afirma `userWalletAddress` en el **path firmado** y en la URL fetch, y su ausencia sin wallet o con wallet en blanco.
- `evaluation-input.test.ts`: wei exacto en el argumento real de la llamada (`"200000000000000000000"`, `"5500000000000000000"`); `NOT_LISTED` verificado por las llamadas al mock (solo bstocks+xstocks, ondo nunca se cotizó); `NO_QUOTE` + pregunta 1 no evaluada sobre el contrato sin ruta (assert sobre conteo de `search`/`profile`); los tres gaps cuando ningún venue cotiza; `toMinimalUnits` y `realInputDeps` con casos reales.
- `evaluate.test.ts`: conjunto parcial decide (`pass` con 2 quotes + gap propagado), **una sola cotización alcanza**, gaps propagados a `cut` q2 y a `unavailable`, cero/duplicadas/NaN siguen `unavailable`.

### Hallazgos menores (no bloqueantes)

- Con `deps.sign === null`, `buildQuotes` devuelve `quotes: []` y `gaps: []` (no declara `NOT_LISTED` aunque el contrato falte): es diagnóstico que se podría enriquecer, pero `quoteGaps` es opcional y el conjunto queda `unavailable` igual que antes — fail closed.
- `toMinimalUnits` lanzaría con `NaN`/`Infinity`, pero `buildEvaluateInput` valida `Number.isFinite` y `> 0` antes de llamarlo (línea 89): inalcanzable por el camino real.
