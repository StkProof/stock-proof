import { expect, test, type Page } from "@playwright/test";

async function evaluar(
  page: Page,
  {
    ticker = "QQQB",
    monto = "200",
    direccion,
    escena,
  }: { ticker?: string; monto?: string; direccion?: string; escena?: string } = {},
) {
  await page.goto("/");
  if (ticker !== "") {
    await page.getByLabel("Ticker").fill(ticker);
  }
  if (monto !== "") {
    await page.getByLabel("Monto en USD").fill(monto);
  }
  if (direccion !== undefined) {
    await page.getByLabel(/Dirección del contrato/).fill(direccion);
  }
  if (escena !== undefined) {
    await page.locator('select[name="escena"]').selectOption(escena);
  }
  await page.getByRole("button", { name: "Evaluar" }).click();
}

test("la home editorial muestra la frase y el formulario", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "Ves la compra.",
  );
  await expect(page.getByLabel("Ticker")).toBeVisible();
  await expect(page.getByLabel("Monto en USD")).toBeVisible();
  await expect(page.getByLabel(/Dirección del contrato/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Evaluar" })).toBeVisible();
  await expect(page.getByTestId("resultado")).toHaveCount(0);
});

test("en 390px la home no se desborda y el menú abre la navegación", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");

  const overflows = await page.evaluate(
    () =>
      document.documentElement.scrollWidth >
      document.documentElement.clientWidth + 1,
  );
  expect(overflows).toBe(false);

  await page.getByRole("button", { name: "Abrir navegación" }).click();
  await expect(page.getByRole("link", { name: "El producto" })).toBeVisible();
});

test("al pasar las cuatro preguntas muestra el emisor, el costo y el bloque de salida", async ({
  page,
}) => {
  await evaluar(page);

  const resultado = page.getByTestId("resultado");
  await expect(resultado).toContainText("Se puede firmar");

  // Las cuatro preguntas en verde.
  for (const id of [1, 2, 3, 4]) {
    await expect(page.getByTestId(`pregunta-${id}`)).toContainText("Pasó");
  }

  // El emisor ganador con su costo simulado e impacto.
  const ruta = page.getByTestId("ruta-ganadora");
  await expect(ruta).toContainText("bStocks");
  await expect(ruta).toContainText("US$");
  await expect(ruta).toContainText("%");

  // El bloque de salida con sus tres capas.
  const salida = page.getByTestId("bloque-salida");
  await expect(page.getByTestId("salida-ahora")).toContainText("Recuperás");
  await expect(salida).toContainText("Disponibilidad");
  await expect(salida).toContainText("Señales de riesgo");

  // El botón de firma se ve pero no envía nada.
  await expect(
    page.getByRole("button", { name: "Firmar swap" }),
  ).toBeDisabled();
});

test("corta en la pregunta 1 con motivo en castellano y el contrato revisado", async ({
  page,
}) => {
  await evaluar(page, {
    ticker: "NVDA",
    direccion: "0x000000000000000000000000000000000000dead",
    escena: "cutQuestion1",
  });

  const resultado = page.getByTestId("resultado");
  await expect(resultado).toContainText("No hay transacción");
  await expect(resultado).toContainText(
    "Este contrato no es el token oficial de ese ticker.",
  );
  await expect(resultado).toContainText("0x000000000000000000000000000000000000dead");

  // La pregunta 1 cortó y las siguientes no se corrieron.
  await expect(page.getByTestId("pregunta-1")).toContainText("No pasó");
  await expect(page.getByTestId("pregunta-2")).toContainText("No se evaluó");

  // Sin costos ni botón de firma.
  await expect(page.getByTestId("cotizaciones")).not.toBeVisible();
  await expect(
    page.getByRole("button", { name: "Firmar swap" }),
  ).not.toBeVisible();
});

test("corta en la pregunta 2 y muestra los costos de los tres emisores", async ({
  page,
}) => {
  await evaluar(page, { ticker: "NVDA", monto: "10000", escena: "cutQuestion2" });

  const resultado = page.getByTestId("resultado");
  await expect(resultado).toContainText("No hay transacción");
  await expect(
    page.getByTestId("pregunta-2"),
  ).toContainText("No pasó");

  const cotizaciones = page.getByTestId("cotizaciones");
  await expect(cotizaciones).toContainText("bStocks");
  await expect(cotizaciones).toContainText("Ondo");
  await expect(cotizaciones).toContainText("xStocks");
  // Tres filas con su costo simulado en USD.
  await expect(cotizaciones.getByText(/US\$/)).toHaveCount(3);

  // Sin botón de firma.
  await expect(
    page.getByRole("button", { name: "Firmar swap" }),
  ).not.toBeVisible();
});

test("con la entrada inválida pide corregirla sin mostrar costos", async ({
  page,
}) => {
  await evaluar(page, { ticker: "", monto: "200" });

  const resultado = page.getByTestId("resultado");
  await expect(resultado).toContainText("Revisá la entrada");
  await expect(resultado).toContainText(
    "El ticker no puede quedar vacío",
  );
  await expect(
    page.getByRole("button", { name: "Firmar swap" }),
  ).not.toBeVisible();
});

test("un monto que no es número positivo también pide corregir", async ({
  page,
}) => {
  await evaluar(page, { monto: "abc" });

  await expect(page.getByTestId("resultado")).toContainText(
    "Revisá la entrada",
  );
});

test("cuando falta un dato dice que no se pudo evaluar, con el motivo", async ({
  page,
}) => {
  await evaluar(page, { ticker: "NVDA", escena: "unavailable" });

  const resultado = page.getByTestId("resultado");
  await expect(resultado).toContainText("No se pudo evaluar");
  await expect(resultado).toContainText("La lista oficial no respondió.");
  await expect(page.getByTestId("pregunta-1")).toContainText("Sin dato");
});

test("el pase del nombre fino muestra «sin dato» en la capa que no se midió", async ({
  page,
}) => {
  await evaluar(page, {
    ticker: "SPCXB",
    monto: "45",
    escena: "passThinNameSinDato",
  });

  await expect(page.getByTestId("resultado")).toContainText("Se puede firmar");
  await expect(page.getByTestId("salida-disponibilidad")).toContainText(
    "sin dato",
  );
  await expect(page.getByTestId("salida-ahora")).toContainText("Recuperás");
  await expect(page.getByTestId("regimen")).toContainText(
    "conviene partir la orden",
  );
});
