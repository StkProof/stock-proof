import { QUESTION_TEXT } from "./messages";
import { Wordmark } from "./wordmark";

const CHECKS = [
  ["El activo", QUESTION_TEXT[1]],
  ["La ejecución", QUESTION_TEXT[2]],
  ["El precio", QUESTION_TEXT[3]],
  ["Las condiciones", QUESTION_TEXT[4]],
] as const;

const EXITS = [
  {
    n: "01",
    title: "Salida ahora",
    tag: "Simulada",
    body: "Qué volvería si vendieras este monto ahora.",
    visual: "Este momento.",
    label: "Una cotización inversa, no el precio de mañana",
    foot: "Misma operación, mismo emisor, este instante.",
  },
  {
    n: "02",
    title: "Disponibilidad",
    tag: "Publicada",
    body: "Cuándo, dónde y con qué reglas se puede salir.",
    visual: "Reglas.",
    label: "Horarios, vías y canje publicados",
    foot: "Informa. No promete liquidez.",
  },
  {
    n: "03",
    title: "Señales de riesgo",
    tag: "Observadas",
    body: "Qué dicen las condiciones de hoy sobre la salida.",
    visual: "Con fuente.",
    label: "Señales medidas, no un pronóstico",
    foot: "Si no hay medición, se lee «sin dato».",
  },
] as const;

const STEPS = [
  ["Decí qué querés.", "Un ticker, un monto y, si hace falta, el contrato a revisar."],
  ["Mirá debajo del precio.", "La prueba revisa el activo, si la orden entra, el número y el régimen."],
  ["Mirá la operación entera.", "Qué cierra, qué no, y qué sigue sin dato. Entrada y salida, juntas."],
  ["Decidí vos.", "Seguí, cambiá el monto o dejalo. La firma todavía no se envía."],
] as const;

export function SiteHero() {
  return (
    <section className="hero section-shell">
      <div className="hero-topline">
        <p className="eyebrow">
          <span className="tiny-square" />
          Una forma más clara de entrar a acciones tokenizadas
        </p>
        <span className="mono edition">Pensar con independencia. Operar con información.</span>
      </div>
      <h1>
        Ves la compra.
        <br />
        Nosotros vemos la{" "}
        <span className="hero-last">
          <em>operación.</em>
          <svg aria-hidden="true" viewBox="0 0 370 28" preserveAspectRatio="none">
            <path d="M4 18C96 5 245 5 364 15M20 25C160 16 259 15 335 20" />
          </svg>
        </span>
      </h1>
      <div className="hero-bottom">
        <p>
          El precio es solo el principio.
          <br />
          Mirá qué estás comprando, cuánto cuesta de verdad
          <br />
          y qué hace falta para salir. <strong>Antes de comprometerte.</strong>
        </p>
        <div className="hero-action">
          <a className="button" href="/operar">
            Ver la operación
            <span aria-hidden="true">↗</span>
          </a>
          <span className="mono muted">Menos confianza ciega. Más prueba.</span>
        </div>
      </div>
      <p className="hero-margin-note">
        <span aria-hidden="true">↙</span>
        Lo que la mayoría
        <br />
        deja afuera.
      </p>
    </section>
  );
}

export function SiteStory() {
  return (
    <>
      <section id="producto" className="manifesto section-shell">
        <p className="eyebrow">
          <span className="tiny-square" />
          Comprar es solo la mitad
        </p>
        <div className="manifesto-grid">
          <h2>
            Un botón de compra
            <br />
            no es toda la <em>historia.</em>
          </h2>
          <div className="manifesto-copy">
            <p className="large-copy">
              Un ticker no es un contrato.
              <br />
              Un precio no es el costo final.
              <br />
              Y una entrada no es una salida.
            </p>
            <p>
              StockProof pone delante el contexto que falta de la operación que ya
              estás mirando. No es otra señal de qué comprar.
            </p>
            <a className="text-button" href="#pruebas">
              Leer entre los números <span aria-hidden="true">↓</span>
            </a>
          </div>
        </div>
      </section>

      <section id="pruebas" className="proofs-section section-shell">
        <div className="proof-editorial">
          <div className="proof-intro">
            <span className="mono">01 / Prueba de entrada</span>
            <h2>
              Sabé en qué te estás <em>metiendo.</em>
            </h2>
            <p>
              Cuatro preguntas antes de una firma. Un motivo para frenar cuando algo
              no cierra.
            </p>
          </div>
          <div className="checks">
            {CHECKS.map(([title, body], index) => (
              <div className="check-row" key={title}>
                <span className="mono">0{index + 1}</span>
                <div>
                  <h3>{title}</h3>
                  <p>{body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="exit-section" aria-labelledby="salida-titulo">
        <div className="section-shell">
          <p className="eyebrow">
            <span className="tiny-square" />
            02 / Prueba de salida
          </p>
          <div className="exit-heading">
            <h2 id="salida-titulo">
              Antes de entrar,
              <br />
              mirá la <em>salida.</em>
            </h2>
            <p>
              Tres preguntas distintas. Porque «se puede vender» no es lo mismo que
              «así se sale».
            </p>
          </div>
          <div className="exit-cards">
            {EXITS.map((item) => (
              <article className="exit-card" key={item.n}>
                <div className="exit-card-top">
                  <span className="mono">{item.n}</span>
                  <span className="tag mono">{item.tag}</span>
                </div>
                <h3>{item.title}</h3>
                <p>{item.body}</p>
                <p className="exit-visual">
                  {item.visual}
                  <span className="mono">{item.label}</span>
                </p>
                <p className="exit-foot">{item.foot}</p>
              </article>
            ))}
          </div>
          <p className="exit-principle">
            <span aria-hidden="true">↳</span>
            Si no lo podemos verificar, lo decimos. Un dato que falta no puede
            parecer una certeza.
          </p>
        </div>
      </section>

      <section id="como-funciona" className="how-section section-shell">
        <p className="eyebrow">
          <span className="tiny-square" />
          Menos fricción. Más contexto.
        </p>
        <div className="section-title-row">
          <h2>
            De la intención
            <br />a la <em>decisión.</em>
          </h2>
        </div>
        <div className="how-grid">
          {STEPS.map(([title, body], index) => (
            <div key={title}>
              <span className="mono step-number">0{index + 1}</span>
              <h3>{title}</h3>
              <p>{body}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="desarrolladores" className="developer-section section-shell">
        <div>
          <p className="eyebrow">
            <span className="tiny-square" />
            Del otro lado de la pantalla
          </p>
          <h2>
            Claro para personas.
            <br />
            <em>Estructurado para agentes.</em>
          </h2>
          <p>
            Una capa de prueba para acciones tokenizadas en BNB Smart Chain. Conecta
            el activo, la simulación de la operación y las condiciones de la frase.
          </p>
          <a
            className="text-button"
            href="https://github.com/StkProof/vault-stockproof"
            target="_blank"
            rel="noreferrer"
          >
            El proyecto en GitHub <span aria-hidden="true">↗</span>
          </a>
          <div className="tech-chips mono">
            <span>BSC</span>
            <span>Datos RWA</span>
            <span>Simulación</span>
            <span>Billetera del agente</span>
          </div>
        </div>
        <div className="code-sheet">
          <div className="code-header mono">
            <span>La prueba, no la promesa</span>
          </div>
          <pre>
            <code>
              <span className="code-muted">
                {"// Forma de Evaluation. La pantalla la muestra; no la calcula."}
              </span>
              {"\n{\n  "}
              <span className="code-key">&quot;kind&quot;</span>
              {': "pass",\n  '}
              <span className="code-key">&quot;wrapper&quot;</span>
              {': "bstocks",\n  '}
              <span className="code-key">&quot;exit&quot;</span>
              {`: {
    "now": "sin dato",
    "availability": "sin dato",
    "risk": "sin dato"
  }
}`}
            </code>
          </pre>
          <p className="small">
            Integrar es leer este resultado. Esta página no firma transacciones.
          </p>
        </div>
      </section>

      <section className="final-cta section-shell">
        <p className="eyebrow">
          <span className="tiny-square" />
          El panorama entero. Antes del clic.
        </p>
        <h2>
          No te quedes con la compra.
          <br />
          <em>Mirá la operación.</em>
        </h2>
        <a className="button" href="/operar">
          Probar una evaluación
          <span aria-hidden="true">↗</span>
        </a>
      </section>
    </>
  );
}

export function SiteFooter() {
  return (
    <footer className="footer section-shell">
      <div className="footer-top">
        <Wordmark />
        <p>Claridad antes de comprometerte.</p>
        <a href="https://github.com/StkProof/vault-stockproof" target="_blank" rel="noreferrer">
          GitHub <span aria-hidden="true">↗</span>
        </a>
        <a href="#top">Volver arriba</a>
      </div>
      <div className="footer-bottom">
        <p>© {new Date().getFullYear()} StockProof. Concepto de producto independiente.</p>
        <p>
          La escena en vivo consulta Binance. No es consejo de inversión. Sin
          afiliación con los emisores de los tickers.
        </p>
      </div>
    </footer>
  );
}
