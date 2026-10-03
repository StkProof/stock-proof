"use client";

import { useRef, useState, type FormEvent } from "react";
import type { Evaluation } from "@/lib/evaluate";
import { evaluationExamples } from "@/lib/evaluation-examples";
import { EvaluationResult } from "./evaluation-result";

type SceneKey = keyof typeof evaluationExamples;

/**
 * El selector elige un resultado ya computado (las escenas del video) o la
 * consulta en vivo. La pantalla no decide el corte: o muestra el ejemplo, o
 * muestra lo que devuelve `POST /api/evaluate`.
 */
const SCENES: { key: SceneKey; label: string }[] = [
  { key: "pass", label: "Pasa: nombre líquido, monto chico (QQQB, US$ 200)" },
  {
    key: "passThinNameSinDato",
    label: "Pasa: nombre fino un sábado, con «sin dato» (SPCXB, US$ 45)",
  },
  {
    key: "cutQuestion1",
    label: "Corta en la pregunta 1: contrato impostor",
  },
  {
    key: "cutQuestion2",
    label: "Corta en la pregunta 2: el monto no entra",
  },
  {
    key: "cutExitNow",
    label: "Corta en salida: vender ahora supera el tope (SPCXB, US$ 2.000)",
  },
  { key: "unavailable", label: "No se pudo evaluar: la lista no respondió" },
  { key: "invalid", label: "Entrada inválida" },
];

const LIVE = "live";

export function StockProofScreen() {
  const [scene, setScene] = useState<SceneKey | typeof LIVE>("pass");
  const [ticker, setTicker] = useState("");
  const [amount, setAmount] = useState("");
  const [address, setAddress] = useState("");
  const [result, setResult] = useState<Evaluation | null>(null);
  const [loading, setLoading] = useState(false);
  const tickerRef = useRef<HTMLInputElement>(null);
  const amountRef = useRef<HTMLInputElement>(null);

  const tickerInvalid = result?.kind === "invalid" && ticker.trim().length === 0;
  const amountInvalid = result?.kind === "invalid" && !tickerInvalid;

  function edit(update: () => void) {
    update();
    setResult(null);
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
              Comprar{" "}
              <label className="inline-field">
                <input
                  ref={tickerRef}
                  name="ticker"
                  aria-label="Ticker"
                  type="text"
                  placeholder="QQQB"
                  autoComplete="off"
                  spellCheck={false}
                  aria-invalid={tickerInvalid || undefined}
                  style={{ width: `${Math.max(4, ticker.length || 4) * 1.8}ch` }}
                  value={ticker}
                  onChange={(event) => edit(() => setTicker(event.target.value))}
                />
              </label>{" "}
              por{" "}
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
              USD.
            </p>
            <p className="input-hint">Tu ticker. Tu monto. Tu decisión.</p>
            <div className="secondary-fields">
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
              <label>
                Escena
                <select
                  name="escena"
                  value={scene}
                  onChange={(event) =>
                    edit(() => setScene(event.target.value as SceneKey | typeof LIVE))
                  }
                >
                  <option value={LIVE}>En vivo (consulta a Binance)</option>
                  {SCENES.map(({ key, label }) => (
                    <option key={key} value={key}>
                      Demo: {label}
                    </option>
                  ))}
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
        Las escenas de ejemplo muestran un resultado ya calculado. La escena en vivo
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
