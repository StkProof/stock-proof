"use client";

import { useState, type FormEvent } from "react";
import type { Evaluation } from "@/lib/evaluate";
import { evaluationExamples } from "@/lib/evaluation-examples";
import { EvaluationResult } from "./evaluation-result";
import styles from "./stock-proof.module.css";

type SceneKey = keyof typeof evaluationExamples;

/**
 * Sin backend todavía: el selector elige qué resultado ya computado muestra
 * «Evaluar» (las escenas del video). Cuando lleguen las APIs, esto se reemplaza
 * por la llamada real y la pantalla no cambia.
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
  { key: "unavailable", label: "No se pudo evaluar: la lista no respondió" },
  { key: "invalid", label: "Entrada inválida" },
];

/** Escena extra: llama a `POST /api/evaluate` con los datos del formulario. */
const LIVE = "live";

export function StockProofScreen() {
  const [scene, setScene] = useState<SceneKey | typeof LIVE>("pass");
  const [result, setResult] = useState<Evaluation | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const ticker = String(data.get("ticker") ?? "");
    // El monto puede venir con coma decimal (es-AR): «200,50».
    const amountUsd = Number(String(data.get("monto") ?? "").replace(",", "."));
    const address = String(data.get("direccion") ?? "").trim();

    // Entrada inválida: la pantalla pide corregir sin llamar a nada (spec).
    if (ticker.trim().length === 0 || !Number.isFinite(amountUsd) || amountUsd <= 0) {
      setResult(evaluationExamples.invalid);
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
          ...(address.length > 0 ? { address } : {}),
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
    <main className={styles.screen}>
      <h1 className={styles.title}>StockProof</h1>
      <p className={styles.tagline}>
        Cuatro preguntas antes de firmar el swap de una acción tokenizada. Si una
        falla, no hay transacción.
      </p>

      <form className={styles.form} onSubmit={onSubmit}>
        <div className={styles.fields}>
          <label className={styles.field}>
            Ticker
            <input
              name="ticker"
              type="text"
              placeholder="QQQB"
              autoComplete="off"
            />
          </label>
          <label className={styles.field}>
            Monto en USD
            <input
              name="monto"
              type="text"
              inputMode="decimal"
              placeholder="200"
              autoComplete="off"
            />
          </label>
          <label className={styles.field}>
            Dirección del contrato a revisar (opcional)
            <input
              name="direccion"
              type="text"
              placeholder="0x…"
              autoComplete="off"
              spellCheck={false}
            />
          </label>
          <label className={styles.field}>
            Escena
            <select
              name="escena"
              value={scene}
              onChange={(event) => setScene(event.target.value as SceneKey | typeof LIVE)}
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
        <button type="submit" className={styles.submit} disabled={loading}>
          {loading ? "Evaluando…" : "Evaluar"}
        </button>
      </form>

      {result !== null && <EvaluationResult evaluation={result} />}
    </main>
  );
}
