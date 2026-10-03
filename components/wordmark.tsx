import Link from "next/link";

export function Wordmark() {
  return (
    <Link className="wordmark" href="/" aria-label="StockProof, inicio">
      <span className="brand-symbol" aria-hidden="true">
        s<span>p</span>
      </span>
      StockProof
      <span className="brand-dot">®</span>
    </Link>
  );
}
