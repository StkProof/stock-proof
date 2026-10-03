import type {
  Evaluation,
  ExitBlock,
  Quote,
  QuoteGap,
  Reference,
  Regime,
  WrapperExit,
} from "@/lib/evaluate";
import { isUnavailableReason, type Q1Result } from "@/lib/questions/q1-reasons";
import {
  formatPercent,
  formatUsd,
  formatUtcDateTime,
  timeSince,
} from "@/lib/format";
import {
  booleanText,
  constraintText,
  marketStatusText,
  multiplierNoteText,
  QUESTION_TEXT,
  quoteGapText,
  reasonText,
  SIN_DATO,
  WRAPPER_LABEL,
} from "./messages";
import styles from "./stock-proof.module.css";

const QUESTION_IDS = [1, 2, 3, 4] as const;

type QuestionStatus = "passed" | "cut" | "unknown" | "skipped";

const STATUS_TEXT: Record<QuestionStatus, string> = {
  passed: "Pasó",
  cut: "No pasó",
  unknown: "Sin dato",
  skipped: "No se evaluó",
};

const STATUS_CLASS: Record<QuestionStatus, string> = {
  passed: styles.qPassed,
  cut: styles.qCut,
  unknown: styles.qUnknown,
  skipped: styles.qSkipped,
};

/**
 * Las preguntas corren en orden: en un `cut`/`unavailable` de la pregunta N las
 * anteriores pasaron y las siguientes no se corrieron (spec de formato).
 */
function questionStatuses(
  evaluation: Evaluation,
): Record<(typeof QUESTION_IDS)[number], QuestionStatus> {
  if (evaluation.kind === "pass") {
    return { 1: "passed", 2: "passed", 3: "passed", 4: "passed" };
  }
  if (evaluation.kind === "invalid") {
    return { 1: "skipped", 2: "skipped", 3: "skipped", 4: "skipped" };
  }
  const statuses = {} as Record<(typeof QUESTION_IDS)[number], QuestionStatus>;
  for (const id of QUESTION_IDS) {
    if (id < evaluation.question) {
      statuses[id] = "passed";
    } else if (id === evaluation.question) {
      statuses[id] = evaluation.kind === "cut" ? "cut" : "unknown";
    } else {
      statuses[id] = "skipped";
    }
  }
  return statuses;
}

const VERDICT: Record<
  Evaluation["kind"],
  { title: string; className: string }
> = {
  pass: { title: "Se puede firmar", className: styles.verdictPass },
  cut: { title: "No hay transacción", className: styles.verdictCut },
  unavailable: { title: "No se pudo evaluar", className: styles.verdictUnknown },
  invalid: { title: "Revisá la entrada", className: styles.verdictUnknown },
};

export function EvaluationResult({ evaluation }: { evaluation: Evaluation }) {
  const verdict = VERDICT[evaluation.kind];
  return (
    <section data-testid="resultado" className={styles.result} aria-live="polite">
      <p className={styles.kicker}>04 / Prueba</p>
      <p className={`${styles.verdict} ${verdict.className}`}>{verdict.title}</p>
      <QuestionList evaluation={evaluation} />
      <EvaluationDetail evaluation={evaluation} />
    </section>
  );
}

function QuestionList({ evaluation }: { evaluation: Evaluation }) {
  const statuses = questionStatuses(evaluation);
  return (
    <ol className={styles.questions} data-testid="preguntas">
      {QUESTION_IDS.map((id) => {
        const status = statuses[id];
        return (
          <li
            key={id}
            data-testid={`pregunta-${id}`}
            className={`${styles.question} ${STATUS_CLASS[status]}`}
          >
            <span className={styles.questionText}>
              {id}. {QUESTION_TEXT[id]}
            </span>
            <span className={styles.questionStatus}>{STATUS_TEXT[status]}</span>
          </li>
        );
      })}
    </ol>
  );
}

function EvaluationDetail({ evaluation }: { evaluation: Evaluation }) {
  switch (evaluation.kind) {
    case "invalid":
      return (
        <p className={styles.detail}>
          El ticker no puede quedar vacío y el monto tiene que ser un número en
          dólares mayor a cero.
        </p>
      );
    case "unavailable":
      return (
        <div className={styles.detail}>
          <p>
            Faltó un dato de la pregunta {evaluation.question} (
            {QUESTION_TEXT[evaluation.question]}): {reasonText(evaluation.reason)}
          </p>
          {evaluation.reference !== undefined && (
            <ReferenceDetail reference={evaluation.reference} />
          )}
          {evaluation.quotes !== undefined && (
            <QuotesTable quotes={evaluation.quotes} exits={evaluation.exits} />
          )}
          <p>Sin inventar un precio, no se arma la transacción.</p>
          <QuoteGaps gaps={evaluation.quoteGaps} />
        </div>
      );
    case "cut":
      return <CutDetail evaluation={evaluation} />;
    case "pass":
      return <PassDetail evaluation={evaluation} />;
  }
}

function CutDetail({
  evaluation,
}: {
  evaluation: Extract<Evaluation, { kind: "cut" }>;
}) {
  return (
    <div className={styles.detail}>
      <p>{reasonText(evaluation.reason)}</p>
      {evaluation.question === 1 && evaluation.address !== undefined && (
        <p>
          Contrato revisado: <code>{evaluation.address}</code>
        </p>
      )}
      {evaluation.question === 1 && evaluation.quotes !== undefined && (
        <QuotesTable quotes={evaluation.quotes} />
      )}
      {evaluation.question === 2 && (
        <QuotesTable quotes={evaluation.quotes} exits={evaluation.exits} />
      )}
      {evaluation.question === 3 && (
        <>
          {evaluation.wrapper !== undefined && (
            <p>Emisor candidato: {WRAPPER_LABEL[evaluation.wrapper]}</p>
          )}
          <ReferenceDetail reference={evaluation.reference} />
        </>
      )}
      {evaluation.question === 4 && (
        <>
          {evaluation.wrapper !== undefined && (
            <p>Emisor candidato: {WRAPPER_LABEL[evaluation.wrapper]}</p>
          )}
          <RegimeDetail regime={evaluation.regime} />
        </>
      )}
      {"quoteGaps" in evaluation && <QuoteGaps gaps={evaluation.quoteGaps} />}
      <p>No se arma la transacción.</p>
    </div>
  );
}

function PassDetail({
  evaluation,
}: {
  evaluation: Extract<Evaluation, { kind: "pass" }>;
}) {
  return (
    <div className={styles.detail}>
      <dl className={styles.summary} data-testid="ruta-ganadora">
        <div>
          <dt>Emisor elegido</dt>
          <dd>{WRAPPER_LABEL[evaluation.wrapper]}</dd>
        </div>
        <div>
          <dt>Costo simulado</dt>
          <dd>{formatUsd(evaluation.simulatedCostUsd)}</dd>
        </div>
        <div>
          <dt>Impacto</dt>
          <dd>{formatPercent(evaluation.impactRatio)}</dd>
        </div>
        <div>
          <dt>Contrato</dt>
          <dd>
            <code>{evaluation.address}</code>
          </dd>
        </div>
      </dl>
      {evaluation.tied && (
        <p>Empató con otro emisor en el mismo impacto.</p>
      )}
      {evaluation.constraints !== undefined &&
        evaluation.constraints.violated.length > 0 && (
          <p>
            Topes de tu frase que no se cumplieron:{" "}
            {evaluation.constraints.violated.map(constraintText).join(", ")}.
          </p>
        )}
      <QuotesTable quotes={evaluation.quotes} exits={evaluation.exits} />
      <QuoteGaps gaps={evaluation.quoteGaps} />
      <ReferenceDetail reference={evaluation.reference} />
      <RegimeDetail regime={evaluation.regime} />
      <ExitBlockView exit={evaluation.exit} />
      <div>
        <button type="button" className={styles.signButton} disabled>
          Firmar swap
        </button>
        <p className={styles.note}>
          El botón se ve, pero la firma todavía no envía la transacción.
        </p>
      </div>
    </div>
  );
}

function authenticityText(authenticity: Q1Result): string {
  if (authenticity.ok) return "Verificado";
  if (isUnavailableReason(authenticity.reason)) return SIN_DATO;
  return "No pasó";
}

function QuoteGaps({ gaps }: { gaps?: QuoteGap[] }) {
  if (gaps === undefined || gaps.length === 0) return null;
  return (
    <div>
      <h3 className={styles.detailHeading}>Sin cotización</h3>
      <ul className={styles.gaps} data-testid="huecos-de-cotizacion">
        {gaps.map((gap) => (
          <li key={gap.wrapper}>
            {WRAPPER_LABEL[gap.wrapper]}: {quoteGapText(gap.reason)}
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Las cotizaciones de compra y, cuando llegaron, la salida de cada emisor: cuánto se
 * recupera vendiendo el mismo monto ahora y a qué costo. La venta que no se midió se
 * lee «sin dato» (esa ruta no se puede firmar).
 */
function QuotesTable({
  quotes,
  exits,
}: {
  quotes: Quote[];
  exits?: WrapperExit[];
}) {
  const exitOf = (wrapper: Quote["wrapper"]) =>
    exits?.find((exit) => exit.wrapper === wrapper)?.now;
  return (
    <table className={styles.quotes} data-testid="cotizaciones">
      <thead>
        <tr>
          <th>Emisor</th>
          <th>Impacto</th>
          <th>Costo simulado</th>
          <th>Pregunta 1</th>
          {exits !== undefined && <th>Salida ahora</th>}
        </tr>
      </thead>
      <tbody>
        {quotes.map((quote) => {
          const now = exitOf(quote.wrapper);
          return (
            <tr key={quote.wrapper}>
              <td>{WRAPPER_LABEL[quote.wrapper]}</td>
              <td>{formatPercent(quote.impactRatio)}</td>
              <td>{formatUsd(quote.simulatedCostUsd)}</td>
              <td>{authenticityText(quote.authenticity)}</td>
              {exits !== undefined && (
                <td>
                  {now === undefined || now === "unavailable"
                    ? SIN_DATO
                    : `${formatUsd(now.recoveredUsd)} (${formatPercent(now.costRatio)})`}
                </td>
              )}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function ReferenceDetail({ reference }: { reference: Reference }) {
  return (
    <dl className={styles.detailList} data-testid="referencia">
      <h3>La referencia</h3>
      <div>
        <dt>Precio de la acción</dt>
        <dd>
          {typeof reference.referenceUsd === "number"
            ? formatUsd(reference.referenceUsd)
            : SIN_DATO}
        </dd>
      </div>
      <div>
        <dt>Precio en el pool</dt>
        <dd>
          {typeof reference.poolUsd === "number"
            ? formatUsd(reference.poolUsd)
            : SIN_DATO}
        </dd>
      </div>
      <div>
        <dt>Desvío</dt>
        <dd>
          {typeof reference.deviationRatio === "number"
            ? formatPercent(reference.deviationRatio)
            : SIN_DATO}
        </dd>
      </div>
      <div>
        <dt>Dividendos</dt>
        <dd>{multiplierNoteText(reference.multiplierNote)}</dd>
      </div>
    </dl>
  );
}

function RegimeDetail({ regime }: { regime: Regime }) {
  return (
    <dl className={styles.detailList} data-testid="regimen">
      <h3>El régimen</h3>
      <div>
        <dt>Mercado</dt>
        <dd>{marketStatusText(regime.marketStatus)}</dd>
      </div>
      <div>
        <dt>Próxima apertura</dt>
        <dd>
          {regime.nextOpenAt === "unavailable"
            ? SIN_DATO
            : formatUtcDateTime(regime.nextOpenAt)}
        </dd>
      </div>
      <div>
        <dt>Los pools coinciden</dt>
        <dd>{booleanText(regime.poolsAgree)}</dd>
      </div>
      <div>
        <dt>Libro clavado</dt>
        <dd>{booleanText(regime.bookFrozen)}</dd>
      </div>
      {regime.suggestSplit && (
        <div>
          <dt>Sugerencia</dt>
          <dd>conviene partir la orden en tramos</dd>
        </div>
      )}
    </dl>
  );
}

const SIGNAL_VALUE_FORMATTER = new Intl.NumberFormat("es-AR", {
  maximumFractionDigits: 4,
});

function signalValueText(value: number | string): string {
  return typeof value === "number"
    ? SIGNAL_VALUE_FORMATTER.format(value)
    : value;
}

function SourceText({ source }: { source: { name: string; url?: string } }) {
  if (source.url === undefined) {
    return <>{source.name}</>;
  }
  return (
    <a href={source.url} target="_blank" rel="noreferrer">
      {source.name}
    </a>
  );
}

function ExitBlockView({ exit }: { exit: ExitBlock }) {
  return (
    <section className={styles.exit} data-testid="bloque-salida">
      <h3>La salida</h3>
      <div className={styles.exitLayers}>
        <div className={styles.exitLayer} data-testid="salida-ahora">
          <h4>Salida ahora</h4>
          {exit.now === "unavailable" ? (
            <p>{SIN_DATO}</p>
          ) : (
            <dl>
              <div>
                <dt>Recuperás</dt>
                <dd>{formatUsd(exit.now.recoveredUsd)}</dd>
              </div>
              <div>
                <dt>Costo de salir</dt>
                <dd>{formatPercent(exit.now.costRatio)}</dd>
              </div>
              <div>
                <dt>Simulado</dt>
                <dd>
                  {timeSince(exit.now.simulatedAt)} (
                  {formatUtcDateTime(exit.now.simulatedAt)})
                </dd>
              </div>
            </dl>
          )}
        </div>
        <div className={styles.exitLayer} data-testid="salida-disponibilidad">
          <h4>Disponibilidad</h4>
          {exit.availability === "unavailable" ? (
            <p>{SIN_DATO}</p>
          ) : (
            <dl>
              <div>
                <dt>Mercado</dt>
                <dd>
                  {marketStatusText(exit.availability.marketStatus)}
                </dd>
              </div>
              <div>
                <dt>Próxima apertura</dt>
                <dd>
                  {exit.availability.nextOpenAt === "unavailable"
                    ? SIN_DATO
                    : formatUtcDateTime(exit.availability.nextOpenAt)}
                </dd>
              </div>
              <div>
                <dt>Horario de emisión y canje</dt>
                <dd>
                  {exit.availability.mintRedeemHours === "unavailable"
                    ? SIN_DATO
                    : exit.availability.mintRedeemHours}
                </dd>
              </div>
              <div>
                <dt>Dónde se canjea</dt>
                <dd>
                  {exit.availability.redemptionVenue === "unavailable"
                    ? SIN_DATO
                    : exit.availability.redemptionVenue}
                </dd>
              </div>
              <div>
                <dt>Fuente</dt>
                <dd>
                  {exit.availability.source === "unavailable" ? (
                    SIN_DATO
                  ) : (
                    <SourceText source={exit.availability.source} />
                  )}
                </dd>
              </div>
            </dl>
          )}
        </div>
        <div className={styles.exitLayer} data-testid="salida-riesgo">
          <h4>Señales de riesgo</h4>
          {exit.risk === "unavailable" ? (
            <p>{SIN_DATO}</p>
          ) : (
            <ul>
              {exit.risk.map((signal) => (
                <li key={signal.code}>
                  <code>{signal.code}</code>: {signalValueText(signal.value)} —{" "}
                  <SourceText source={signal.source} />,{" "}
                  {formatUtcDateTime(signal.observedAt)}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
