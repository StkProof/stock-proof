"use client";

import { useEffect, useState } from "react";
import { Wordmark } from "./wordmark";

const LINKS = [
  { href: "#producto", label: "El producto" },
  { href: "#como-funciona", label: "Cómo funciona" },
  { href: "#desarrolladores", label: "Para quien integra" },
];

export function SiteHeader({ mode = "story" }: { mode?: "story" | "product" }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <header className={mode === "product" ? "header product-header section-shell" : "header section-shell"}>
      <a href="#main" className="skip-link">
        Saltar al contenido
      </a>
      <Wordmark href={mode === "product" ? "/" : "#top"} />
      {mode === "story" && (
        <nav className={open ? "nav open" : "nav"} aria-label="Principal">
          {LINKS.map((link) => (
            <a key={link.href} href={link.href} onClick={() => setOpen(false)}>
              {link.label}
            </a>
          ))}
        </nav>
      )}
      <a className="nav-cta" href={mode === "product" ? "/" : "/operar"}>
        {mode === "product" ? "La historia" : "Probar"}
        <span aria-hidden="true">↗</span>
      </a>
      {mode === "story" && (
        <button
          className="menu-toggle"
          type="button"
          aria-expanded={open}
          aria-label={open ? "Cerrar navegación" : "Abrir navegación"}
          onClick={() => setOpen((value) => !value)}
        >
          {open ? "Cerrar" : "Menú"}
        </button>
      )}
    </header>
  );
}
