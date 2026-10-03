export function Wordmark({ href = "#top" }: { href?: string }) {
  return (
    <a className="wordmark" href={href} aria-label="StockProof, inicio">
      <span className="brand-symbol" aria-hidden="true">
        s<span>p</span>
      </span>
      StockProof
      <span className="brand-dot">®</span>
    </a>
  );
}
