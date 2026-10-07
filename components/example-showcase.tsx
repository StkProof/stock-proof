"use client";

import Link from "next/link";
import { useRef, useState, type KeyboardEvent } from "react";
import { evaluationExamples } from "@/lib/evaluation-examples";
import { operationStops } from "@/lib/question-statuses";
import { EvaluationResult } from "./evaluation-result";
import { OperationScene } from "./operation-scene";

const TABS = [
  { key: "pass", label: "Pasa", note: "QQQB · US$ 200" },
  { key: "cutExitNow", label: "Corta en la salida", note: "SPCXB · US$ 2.000" },
  { key: "cutQuestion1", label: "Contrato impostor", note: "NVDA · contrato pegado" },
  { key: "passThinNameSinDato", label: "Nombre fino un sábado", note: "SPCXB · US$ 45" },
] as const satisfies readonly { key: keyof typeof evaluationExamples; label: string; note: string }[];

const STOP_LABELS = ["El activo", "Entra y sale", "El precio", "El régimen", "Firma"];

/**
 * La muestra de la landing: resultados que `evaluate` ya calculó sobre los ejemplos
 * guardados, con el recorrido en 3D al lado. Sin formulario y sin red: probar con un
 * monto propio es en `/app`.
 */
export function ExampleShowcase() {
  const [active, setActive] = useState(0);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const tab = TABS[active];
  const evaluation = evaluationExamples[tab.key];
  const stops = operationStops(evaluation);

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const step = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    if (step === 0) return;
    event.preventDefault();
    const next = (active + step + TABS.length) % TABS.length;
    setActive(next);
    tabRefs.current[next]?.focus();
  }

  return (
    <section id="muestra" className="showcase section-shell" aria-labelledby="muestra-titulo">
      <div className="section-heading">
        <h2 id="muestra-titulo" className="eyebrow">
          <span className="tiny-square" />
          La operación, con la letra chica
        </h2>
        <span className="mono demo-label">
          <span className="status-dot" />
          Ejemplo guardado · no consulta el mercado
        </span>
      </div>

      <div className="showcase-tabs" role="tablist" aria-label="Ejemplos" onKeyDown={onKeyDown}>
        {TABS.map((item, index) => (
          <button
            key={item.key}
            ref={(node) => {
              tabRefs.current[index] = node;
            }}
            type="button"
            role="tab"
            id={`muestra-tab-${item.key}`}
            aria-selected={index === active}
            aria-controls="muestra-panel"
            tabIndex={index === active ? 0 : -1}
            className="showcase-tab"
            onClick={() => setActive(index)}
          >
            <span className="mono">0{index + 1}</span>
            {item.label}
            <span className="mono muted">{item.note}</span>
          </button>
        ))}
      </div>

      <div
        id="muestra-panel"
        role="tabpanel"
        aria-labelledby={`muestra-tab-${tab.key}`}
        className="showcase-panel"
      >
        <figure className="showcase-stage">
          <OperationScene stops={stops} />
          <figcaption>
            <ol className="stop-legend mono">
              {STOP_LABELS.map((label, index) => (
                <li key={label} data-estado={stops[index]}>
                  {label}
                </li>
              ))}
            </ol>
          </figcaption>
        </figure>
        <div className="showcase-result">
          <EvaluationResult evaluation={evaluation} />
        </div>
      </div>

      <div className="showcase-foot">
        <p>
          Cada pestaña es lo que devuelve la evaluación sobre un caso guardado. Nada de
          esto está escrito a mano en la página.
        </p>
        <Link className="button" href="/app">
          Probar con tu ticker y tu monto
          <span aria-hidden="true">↗</span>
        </Link>
      </div>
    </section>
  );
}
