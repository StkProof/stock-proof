import type { Metadata } from "next";
import { SiteHeader } from "@/components/site-header";
import { StockProofScreen } from "@/components/stock-proof-screen";

export const metadata: Metadata = {
  title: "StockProof — La operación",
  description:
    "La prueba de una compra de acción tokenizada: cuatro preguntas, el costo y la salida, antes de firmar.",
};

export default function OperarPage() {
  return (
    <div id="top">
      <SiteHeader mode="product" />
      <main id="main">
        <StockProofScreen />
      </main>
    </div>
  );
}
