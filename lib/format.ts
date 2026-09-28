/** Formato de moneda en español (Argentina). */
export function formatCurrency(value: number): string {
  if (!Number.isFinite(value)) {
    throw new Error("formatCurrency espera un número finito");
  }
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
  }).format(value);
}

const USD_FORMATTER = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "USD",
});

/** Formato de moneda en dólares con reglas es-AR: `US$ 1.999,50`. */
export function formatUsd(value: number): string {
  if (!Number.isFinite(value)) {
    throw new Error("formatUsd espera un número finito");
  }
  return USD_FORMATTER.format(value);
}

const PERCENT_FORMATTER = new Intl.NumberFormat("es-AR", {
  style: "percent",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** Un ratio (0.01) se lee como porcentaje con coma decimal: `1,00%`. */
export function formatPercent(ratio: number): string {
  if (!Number.isFinite(ratio)) {
    throw new Error("formatPercent espera un número finito");
  }
  return PERCENT_FORMATTER.format(ratio);
}

const UTC_DATETIME_FORMATTER = new Intl.DateTimeFormat("es-AR", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "UTC",
});

/** Fecha ISO 8601 UTC a texto legible: `28 sept 2026, 12:00 p. m.` (la fecha inválida da «sin dato»). */
export function formatUtcDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return "sin dato";
  }
  return UTC_DATETIME_FORMATTER.format(date);
}

/** Edad de un dato medido: `hace 5 segundos`, `hace 3 días`. `now` es inyectable para el test. */
export function timeSince(iso: string, now: Date = new Date()): string {
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) {
    return "sin dato";
  }
  const seconds = (now.getTime() - then.getTime()) / 1000;
  const abs = Math.abs(seconds);
  const rtf = new Intl.RelativeTimeFormat("es-AR", { numeric: "auto" });
  const steps: [Intl.RelativeTimeFormatUnit, number][] = [
    ["day", 86_400],
    ["hour", 3_600],
    ["minute", 60],
  ];
  for (const [unit, size] of steps) {
    if (abs >= size) {
      return rtf.format(-Math.trunc(seconds / size), unit);
    }
  }
  return rtf.format(-Math.trunc(seconds), "second");
}
