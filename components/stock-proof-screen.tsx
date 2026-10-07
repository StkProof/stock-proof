"use client";

import { useRef, useState, type FormEvent } from "react";
import type { Evaluation } from "@/lib/evaluate";
import { evaluationExamples } from "@/lib/evaluation-examples";
import { impactRatioFromPercent } from "@/lib/phrase";
import { EvaluationResult } from "./evaluation-result";

type SceneKey = keyof typeof evaluationExamples;

/** Lo que la frase muestra cuando se elige un caso ya calculado. */
type DemoCase = {
  key: SceneKey;
  label: string;
  ticker: string;
  amount: string;
  address: string;
  limit: string;
};

/**
 * El selector elige un resultado ya computado o la consulta en vivo.
 * La pantalla no decide el corte: o muestra el ejemplo, o muestra lo que
 * devuelve `POST /api/evaluate`.
 */
const CASES: DemoCase[] = [
  { key: "pass", label: "Pasa", ticker: "QQQB", amount: "200", address: "", limit: "1" },
  {
    key: "passThinNameSinDato",
    label: "Nombre fino, con un dato que falta",
    ticker: "SPCXB",
    amount: "45",
    address: "",
    limit: "1",
  },
  {
    key: "passTopeFrase",
    label: "El tope de la frase no se cumple",
    ticker: "QQQB",
    amount: "200",
    address: "",
    limit: "0,3",
  },
  {
    key: "cutQuestion1",
    label: "Corta: el contrato no es el real",
    ticker: "NVDA",
    amount: "200",
    address: "0x000000000000000000000000000000000000dead",
    limit: "1",
  },
  {
    key: "cutQuestion2",
    label: "Corta: el monto no entra",
    ticker: "NVDA",
    amount: "10000",
    address: "",
    limit: "1",
  },
  {
    key: "cutExitNow",
    label: "Corta: vender ahora sale caro",
    ticker: "SPCXB",
    amount: "2000",
    address: "",
    limit: "1",
  },
  {
    key: "unavailable",
    label: "No se pudo evaluar",
    ticker: "NVDA",
    amount: "200",
    address: "",
    limit: "1",
  },
  { key: "invalid", label: "Entrada inválida", ticker: "", amount: "0", address: "", limit: "1" },
];

const OPENING = CASES[0];
const LIVE = "live";

export function StockProofScreen() {
  const [scene, setScene] = useState<SceneKey | typeof LIVE>(OPENING.key);
  const [ticker, setTicker] = useState(OPENING.ticker);
  const [amount, setAmount] = useState(OPENING.amount);
  const [address, setAddress] = useState(OPENING.address);
  const [showAddress, setShowAddress] = useState(false);
  const [limit, setLimit] = useState(OPENING.limit);
  const [limitError, setLimitError] = useState(false);
  const [result, setResult] = useState<Evaluation | null>(evaluationExamples.pass);
  const [loading, setLoading] = useState(false);
  const tickerRef = useRef<HTMLInputElement>(null);
  const amountRef = useRef<HTMLInputElement>(null);
  const limitRef = useRef<HTMLInputElement>(null);

  const tickerInvalid = result?.kind === "invalid" && ticker.trim().length === 0;
  const amountInvalid = result?.kind === "invalid" && !tickerInvalid;

  function edit(update: () => void) {
    update();
    setResult(null);
    setLimitError(false);
  }

  function applyCase(key: SceneKey) {
    const demo = CASES.find((item) => item.key === key) ?? OPENING;
    setScene(demo.key);
    setTicker(demo.ticker);
    setAmount(demo.amount);
    setAddress(demo.address);
    setShowAddress(demo.address.length > 0);
    setLimit(demo.limit);
    setLimitError(false);
    setResult(evaluationExamples[demo.key]);
  }

  function chooseScene(value: string) {
    if (value === LIVE) {
      setScene(LIVE);
      setAddress("");
      setShowAddress(false);
      setLimitError(false);
      setResult(null);
      return;
    }
    applyCase(value as SceneKey);
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const amountUsd = Number(amount.replace(",", "."));

    if (ticker.trim().length === 0 || !Number.isFinite(amountUsd) || amountUsd <= 0) {
      setResult(evaluationExamples.invalid);
      if (ticker.trim().length === 0) tickerRef.current?.focus();
      else amountRef.current?.focus();
      return;
    }
    const maxImpactRatio = impactRatioFromPercent(limit);
    if (maxImpactRatio === null) {
      setLimitError(true);
      setResult(null);
      limitRef.current?.focus();
      return;
    }
    if (scene !== LIVE) {
      setResult(evaluationExamples[scene]);
      return;
    }

    setLoading(true);
    try {
      const response = await fetch("/api/evaluate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ticker: ticker.trim(),
          amountUsd,
          ...(address.trim().length > 0 ? { address: address.trim() } : {}),
          ...(maxImpactRatio === undefined
            ? {}
            : { maxImpactPercent: limit.trim().replace(",", ".") }),
        }),
      });
      setResult((await response.json()) as Evaluation);
    } catch {
      setResult({ kind: "unavailable", question: 1, reason: "LIST_UNAVAILABLE" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <section id="demo" className="demo-section section-shell" aria-labelledby="demo-titulo">
      <div className="section-heading">
        <h2 id="demo-titulo" className="eyebrow">
          <span className="tiny-square" />
          La operación, con la letra chica
        </h2>
        <span className="mono demo-label">
          <span className="status-dot" />
          {scene === LIVE
            ? "Consulta en vivo · BSC"
            : "Ejemplo guardado · no consulta el mercado"}
        </span>
      </div>

      <div className="proof-workspace">
        <div className="intent-column">
          <span className="mono muted">01 / Empezá por la intención</span>
          <form onSubmit={onSubmit}>
            <p className="intent-sentence">
              Comprame US${" "}
              <label className="inline-field">
                <input
                  ref={amountRef}
                  name="monto"
                  aria-label="Monto en USD"
                  type="text"
                  inputMode="decimal"
                  placeholder="200"
                  autoComplete="off"
                  aria-invalid={amountInvalid || undefined}
                  style={{ width: `${Math.max(3, amount.length || 3) * 1.35}ch` }}
                  value={amount}
                  onChange={(event) => edit(() => setAmount(event.target.value))}
                />
              </label>{" "}
              de{" "}
              <label className="inline-field">
                <input
                  ref={tickerRef}
                  name="ticker"
                  aria-label="Ticker"
                  type="text"
                  placeholder="NVDA"
                  autoComplete="off"
                  spellCheck={false}
                  aria-invalid={tickerInvalid || undefined}
                  style={{ width: `${Math.max(4, ticker.length || 4) * 1.8}ch` }}
                  value={ticker}
                  onChange={(event) => edit(() => setTicker(event.target.value))}
                />
              </label>{" "}
              si el contrato es el real y el costo no supera el{" "}
              <label className="inline-field">
                <input
                  ref={limitRef}
                  name="tope"
                  aria-label="Tope de costo"
                  type="text"
                  inputMode="decimal"
                  placeholder="1"
                  autoComplete="off"
                  aria-invalid={limitError || undefined}
                  aria-describedby={limitError ? "error-tope" : undefined}
                  style={{ width: `${Math.max(1, limit.length || 1) * 1.6}ch` }}
                  value={limit}
                  onChange={(event) => edit(() => setLimit(event.target.value))}
                />
              </label>{" "}
              %.
            </p>
            {limitError && (
              <p id="error-tope" className="input-hint">
                El tope tiene que ser un porcentaje mayor a cero y como máximo 100.
              </p>
            )}
            <p className="input-hint">Tu ticker. Tu monto. Tu tope. Tu decisión.</p>
            <div className="secondary-fields">
              {showAddress ? (
                <label>
                  Dirección del contrato a revisar (opcional)
                  <input
                    name="direccion"
                    type="text"
                    placeholder="0x…"
                    autoComplete="off"
                    spellCheck={false}
                    value={address}
                    onChange={(event) => edit(() => setAddress(event.target.value))}
                  />
                </label>
              ) : (
                <button
                  className="text-button"
                  type="button"
                  onClick={() => setShowAddress(true)}
                >
                  Revisar un contrato
                </button>
              )}
              <label>
                Caso
                <select
                  name="escena"
                  value={scene}
                  onChange={(event) => chooseScene(event.target.value)}
                >
                  {CASES.map(({ key, label }) => (
                    <option key={key} value={key}>
                      {label}
                    </option>
                  ))}
                  <option value={LIVE}>En vivo</option>
                </select>
              </label>
            </div>
            <button className="button" type="submit" disabled={loading} style={{ marginTop: "1.25rem" }}>
              {loading ? "Evaluando…" : "Evaluar"}
              <span aria-hidden="true">↗</span>
            </button>
          </form>
          <div className="intent-footnote">
            <span className="asterisk" aria-hidden="true">
              ✳
            </span>
            <p>
              Cuatro preguntas antes de firmar. Si una falla, no hay transacción.
              <br />
              Evaluar no mueve fondos.
            </p>
          </div>
        </div>

        <div className="reality-column">
          <div className="demo-output">
            {result === null ? (
              <IntentPreview ticker={ticker} amount={amount} />
            ) : (
              <EvaluationResult evaluation={result} />
            )}
          </div>
        </div>
      </div>
      <p className="demo-disclaimer">
        Los casos de ejemplo muestran un resultado ya calculado. «En vivo»
        consulta Binance. Ninguna de las dos es consejo de inversión ni una orden
        para firmar.
      </p>
    </section>
  );
}

function IntentPreview({ ticker, amount }: { ticker: string; amount: string }) {
  const shownAmount = amount.trim().length > 0 ? amount.trim() : "0";
  const shownTicker = ticker.trim().length > 0 ? ticker.trim() : "el ticker";
  return (
    <div>
      <span className="mono muted">01 / El número que ves</span>
      <p className="big-number">
        US$ {shownAmount}
        <span className="violet">.</span>
      </p>
      <p className="annotation">
        <span aria-hidden="true">↳</span> Detrás de {shownTicker} hay más que este número.
      </p>
      <div className="preview-lines">
        <div>
          <span>Costo real de entrar</span>
          <span>?</span>
        </div>
        <div>
          <span>Qué vuelve si salís</span>
          <span>?</span>
        </div>
        <div>
          <span>Las condiciones del medio</span>
          <span>?</span>
        </div>
      </div>
      <p className="small muted">
        Empezá por la intención. Del otro lado está la prueba, no una estimación.
      </p>
    </div>
  );
}
