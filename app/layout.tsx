import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "StockProof — Ves la compra. Nosotros vemos la operación.",
  description:
    "Cuatro preguntas antes de firmar el swap de una acción tokenizada en BSC. La pantalla muestra la prueba; no la calcula.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
