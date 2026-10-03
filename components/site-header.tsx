"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Wordmark } from "./wordmark";

const LINKS = [
  { href: "#producto", label: "El producto" },
  { href: "#como-funciona", label: "Cómo funciona" },
  { href: "#desarrolladores", label: "Para quien integra" },
];

export function SiteHeader() {
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
    <header className="header section-shell">
      <a href="#main" className="skip-link">
        Saltar al contenido
      </a>
      <Wordmark />
      <nav className={open ? "nav open" : "nav"} aria-label="Principal">
        {LINKS.map((link) => (
          <a key={link.href} href={link.href} onClick={() => setOpen(false)}>
            {link.label}
          </a>
        ))}
      </nav>
      <Link className="nav-cta" href="/app">
        Probar
        <span aria-hidden="true">↗</span>
      </Link>
      <button
        className="menu-toggle"
        type="button"
        aria-expanded={open}
        aria-label={open ? "Cerrar navegación" : "Abrir navegación"}
        onClick={() => setOpen((value) => !value)}
      >
        {open ? "Cerrar" : "Menú"}
      </button>
    </header>
  );
}

/** Encabezado de la app: solo el logo, que vuelve a la landing. */
export function AppHeader() {
  return (
    <header className="header app-header section-shell">
      <a href="#main" className="skip-link">
        Saltar al contenido
      </a>
      <Wordmark />
    </header>
  );
}
