import type { Metadata } from "next";
import { AppHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-sections";
import { StockProofScreen } from "@/components/stock-proof-screen";

export const metadata: Metadata = {
  title: "StockProof — Evaluá la operación",
  description:
    "Escribí un ticker y un monto: las cuatro preguntas y la salida, antes de firmar el swap.",
};

export default function AppPage() {
  return (
    <div id="top">
      <AppHeader />
      <main id="main" className="app-main">
        <div className="app-intro section-shell">
          <h1>
            Evaluá la <em>operación.</em>
          </h1>
          <p>
            Escribí un ticker y un monto. Las cuatro preguntas y la salida, antes de firmar.
          </p>
        </div>
        <StockProofScreen />
      </main>
      <SiteFooter />
    </div>
  );
}
