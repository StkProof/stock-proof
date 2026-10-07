import { expect, test, type Page } from "@playwright/test";

async function evaluar(
  page: Page,
  {
    ticker,
    monto,
    direccion,
    escena,
  }: { ticker?: string; monto?: string; direccion?: string; escena?: string } = {},
) {
  await page.goto("/app");
  if (escena !== undefined) {
    await page.locator('select[name="escena"]').selectOption(escena);
  }
  if (ticker !== undefined) {
    await page.getByLabel("Ticker").fill(ticker);
  }
  if (monto !== undefined) {
    await page.getByLabel("Monto en USD").fill(monto);
  }
  if (direccion !== undefined) {
    const field = page.getByLabel(/Dirección del contrato/);
    if ((await field.count()) === 0) {
      await page.getByRole("button", { name: "Revisar un contrato" }).click();
    }
    await page.getByLabel(/Dirección del contrato/).fill(direccion);
  }
  await page.getByRole("button", { name: "Evaluar" }).click();
}

async function elegirCaso(page: Page, escena: string) {
  await page.goto("/app");
  await page.locator('select[name="escena"]').selectOption(escena);
}

test("la app muestra el formulario con un encabezado mínimo", async ({ page }) => {
  const scripts: string[] = [];
  page.on("request", (request) => {
    if (request.resourceType() === "script") scripts.push(request.url());
  });
  await page.goto("/app");

  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "Evaluá la operación.",
  );
  await expect(page.getByLabel("Ticker")).toBeVisible();
  await expect(page.getByLabel("Monto en USD")).toBeVisible();
  await expect(page.getByRole("button", { name: "Evaluar" })).toBeVisible();

  // Sin la navegación de la landing ni la escena 3D.
  await expect(page.getByRole("link", { name: "El producto" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Abrir navegación" })).toHaveCount(0);
  await expect(page.locator("canvas")).toHaveCount(0);
  expect(scripts.filter((url) => /three/i.test(url))).toEqual([]);

  // El logo vuelve a la landing.
  await page.getByRole("link", { name: "StockProof, inicio" }).first().click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Ves la compra.");
});

test("en 390px la app no se desborda", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/app");

  const overflows = await page.evaluate(
    () =>
      document.documentElement.scrollWidth >
      document.documentElement.clientWidth + 1,
  );
  expect(overflows).toBe(false);
});

test("la app abre con el caso que pasa, sin un clic", async ({ page }) => {
  await page.goto("/app");

  await expect(page.getByText(/Comprame US\$/)).toBeVisible();
  await expect(page.getByText(/si el contrato es el real/)).toBeVisible();
  await expect(page.getByText(/no supera el/)).toBeVisible();
  await expect(page.getByLabel("Ticker")).toHaveValue("QQQB");
  await expect(page.getByLabel("Monto en USD")).toHaveValue("200");
  await expect(page.getByLabel("Tope de costo")).toHaveValue("1");
  await expect(page.getByLabel(/Dirección del contrato/)).toHaveCount(0);

  const resultado = page.getByTestId("resultado");
  await expect(resultado).toContainText("Se puede firmar");
  for (const id of [1, 2, 3, 4]) {
    await expect(page.getByTestId(`pregunta-${id}`)).toContainText("Pasó");
  }
  await expect(page.getByTestId("salida-riesgo")).toContainText("sin dato");
  await expect(page.getByTestId("salida-riesgo")).not.toContainText("POOL_DISPERSION");
  await expect(page.getByRole("button", { name: "Firmar swap" })).toBeDisabled();
  await expect(page.getByTestId("ruta-ganadora")).toContainText("bStocks");
  await expect(page.getByTestId("bloque-salida")).toContainText("Disponibilidad");
});

test("revisar un contrato muestra la dirección sin evaluar", async ({ page }) => {
  await page.goto("/app");
  await expect(page.getByLabel(/Dirección del contrato/)).toHaveCount(0);
  await page.getByRole("button", { name: "Revisar un contrato" }).click();
  await expect(page.getByLabel(/Dirección del contrato/)).toBeVisible();
  await expect(page.getByTestId("resultado")).toContainText("Se puede firmar");
});

test("en vivo no consulta hasta apretar Evaluar", async ({ page }) => {
  let calls = 0;
  await page.route("**/api/evaluate", async (route) => {
    calls += 1;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        kind: "unavailable",
        question: 1,
        reason: "LIST_UNAVAILABLE",
      }),
    });
  });
  await page.goto("/app");
  expect(calls).toBe(0);

  await page.locator('select[name="escena"]').selectOption("live");
  await expect(page.getByTestId("resultado")).toHaveCount(0);
  expect(calls).toBe(0);

  await page.getByRole("button", { name: "Evaluar" }).click();
  await expect.poll(() => calls).toBe(1);
  await expect(page.getByTestId("resultado")).toContainText("La lista oficial no respondió.");
  await expect(page.getByTestId("resultado")).not.toContainText("LIST_UNAVAILABLE");
  await expect(page.getByTestId("pregunta-1")).toContainText("Sin dato");
});

test("un caso guardado no consulta aunque se apriete Evaluar", async ({ page }) => {
  let calls = 0;
  await page.route("**/api/evaluate", async (route) => {
    calls += 1;
    await route.fulfill({
      json: { kind: "unavailable", question: 1, reason: "LIST_UNAVAILABLE" },
    });
  });
  await elegirCaso(page, "cutQuestion2");
  await page.getByRole("button", { name: "Evaluar" }).click();

  await expect(page.getByTestId("resultado")).toContainText("No hay transacción");
  await expect(page.getByTestId("pregunta-2")).toContainText("No pasó");
  expect(calls).toBe(0);
});

test("la frase pide el contrato real y un tope de costo", async ({ page }) => {
  await page.goto("/app");

  await expect(page.getByText(/si el contrato es el real/)).toBeVisible();
  await expect(page.getByLabel("Tope de costo")).toHaveValue("1");
});

test("un tope que no es un porcentaje pide corregirlo sin evaluar", async ({
  page,
}) => {
  await evaluar(page, { monto: "200" });
  await page.getByLabel("Tope de costo").fill("0");
  await page.getByRole("button", { name: "Evaluar" }).click();

  await expect(page.getByText(/porcentaje mayor a cero/)).toBeVisible();
  await expect(page.getByTestId("resultado")).toHaveCount(0);
});

for (const { tope, esperado } of [
  { tope: "0,5", esperado: "0.5" },
  { tope: "", esperado: undefined },
]) {
  test(`en vivo, el tope «${tope}» viaja a la ruta como ${esperado ?? "ausente"}`, async ({
    page,
  }) => {
    const cuerpos: Record<string, unknown>[] = [];
    await page.route("**/api/evaluate", async (route) => {
      cuerpos.push(route.request().postDataJSON() as Record<string, unknown>);
      await route.fulfill({
        json: { kind: "unavailable", question: 2, reason: "QUOTES_UNAVAILABLE" },
      });
    });

    await page.goto("/app");
    await page.getByLabel("Ticker").fill("NVDA");
    await page.getByLabel("Monto en USD").fill("200");
    await page.getByLabel("Tope de costo").fill(tope);
    await page.locator('select[name="escena"]').selectOption("live");
    await page.getByRole("button", { name: "Evaluar" }).click();

    await expect(page.getByTestId("resultado")).toContainText("No se pudo evaluar");
    expect(cuerpos).toHaveLength(1);
    if (esperado === undefined) {
      expect(cuerpos[0]).not.toHaveProperty("maxImpactPercent");
    } else {
      expect(cuerpos[0].maxImpactPercent).toBe(esperado);
    }
  });
}

test("al pasar las cuatro preguntas muestra el emisor, el costo y el bloque de salida", async ({
  page,
}) => {
  await page.goto("/app");

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

  // El bloque de salida con sus tres capas. Las señales de riesgo no se miden todavía
  // (issue #19): la capa dice «sin dato» y no muestra un código crudo.
  const salida = page.getByTestId("bloque-salida");
  await expect(page.getByTestId("salida-ahora")).toContainText("Recuperás");
  await expect(salida).toContainText("Disponibilidad");
  await expect(salida).toContainText("Señales de riesgo");
  const riesgo = page.getByTestId("salida-riesgo");
  await expect(riesgo).toContainText("sin dato");
  await expect(riesgo).not.toContainText("POOL_DISPERSION");

  // El botón de firma se ve pero no envía nada.
  await expect(
    page.getByRole("button", { name: "Firmar swap" }),
  ).toBeDisabled();
});

test("corta en la pregunta 1 con motivo en castellano y el contrato revisado", async ({
  page,
}) => {
  await elegirCaso(page, "cutQuestion1");

  await expect(page.getByLabel("Ticker")).toHaveValue("NVDA");
  await expect(page.getByLabel("Monto en USD")).toHaveValue("200");
  await expect(page.getByLabel("Tope de costo")).toHaveValue("1");
  await expect(page.getByLabel(/Dirección del contrato/)).toHaveValue(
    "0x000000000000000000000000000000000000dead",
  );

  const resultado = page.getByTestId("resultado");
  await expect(resultado).not.toContainText("CONTRACT_NOT_LISTED");
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
  await elegirCaso(page, "cutQuestion2");

  await expect(page.getByLabel("Ticker")).toHaveValue("NVDA");
  await expect(page.getByLabel("Monto en USD")).toHaveValue("10000");
  await expect(page.getByLabel("Tope de costo")).toHaveValue("1");
  await expect(page.getByLabel(/Dirección del contrato/)).toHaveCount(0);

  const resultado = page.getByTestId("resultado");
  await expect(resultado).toContainText("No hay transacción");
  await expect(
    page.getByTestId("pregunta-2"),
  ).toContainText("No pasó");

  const cotizaciones = page.getByTestId("cotizaciones");
  await expect(cotizaciones).toContainText("bStocks");
  await expect(cotizaciones).toContainText("Ondo");
  await expect(cotizaciones).toContainText("xStocks");
  // Tres filas, cada una con su costo simulado en USD.
  const filas = cotizaciones.locator("tbody tr");
  await expect(filas).toHaveCount(3);
  for (const fila of await filas.all()) {
    await expect(fila).toContainText("US$");
  }
  // La venta del mismo monto: medida en bStocks, sin dato en xStocks.
  await expect(cotizaciones).toContainText("Salida ahora");
  await expect(filas.filter({ hasText: "bStocks" })).toContainText("US$ 9.500");
  await expect(filas.filter({ hasText: "xStocks" })).toContainText("sin dato");

  // Sin botón de firma.
  await expect(
    page.getByRole("button", { name: "Firmar swap" }),
  ).not.toBeVisible();
});

test("corta en la pregunta 2 cuando la compra entra pero la venta supera el tope", async ({
  page,
}) => {
  await elegirCaso(page, "cutExitNow");

  await expect(page.getByLabel("Ticker")).toHaveValue("SPCXB");
  await expect(page.getByLabel("Monto en USD")).toHaveValue("2000");
  await expect(page.getByLabel("Tope de costo")).toHaveValue("1");

  const resultado = page.getByTestId("resultado");
  await expect(resultado).not.toContainText("EXIT_OVER_LIMIT");
  await expect(resultado).toContainText("No hay transacción");
  await expect(page.getByTestId("pregunta-2")).toContainText("No pasó");
  await expect(resultado).toContainText("Vender este monto ahora cuesta más del 1%");

  // El costo de la venta medida se muestra en la tabla.
  const bstocks = page
    .getByTestId("cotizaciones")
    .locator("tbody tr")
    .filter({ hasText: "bStocks" });
  await expect(bstocks).toContainText("US$ 1.952");

  await expect(
    page.getByRole("button", { name: "Firmar swap" }),
  ).not.toBeVisible();
});

test("el caso de entrada inválida se aplica al elegirlo", async ({ page }) => {
  await elegirCaso(page, "invalid");

  await expect(page.getByLabel("Ticker")).toHaveValue("");
  await expect(page.getByLabel("Monto en USD")).toHaveValue("0");
  await expect(page.getByLabel("Tope de costo")).toHaveValue("1");
  await expect(page.getByTestId("resultado")).toContainText("Revisá la entrada");
  await expect(page.getByRole("button", { name: "Firmar swap" })).not.toBeVisible();
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
  await elegirCaso(page, "unavailable");

  await expect(page.getByLabel("Ticker")).toHaveValue("NVDA");
  await expect(page.getByLabel("Monto en USD")).toHaveValue("200");
  await expect(page.getByLabel("Tope de costo")).toHaveValue("1");

  const resultado = page.getByTestId("resultado");
  await expect(resultado).not.toContainText("LIST_UNAVAILABLE");
  await expect(resultado).toContainText("No se pudo evaluar");
  await expect(resultado).toContainText("La lista oficial no respondió.");
  await expect(page.getByTestId("pregunta-1")).toContainText("Sin dato");
});

test("el pase del nombre fino muestra «sin dato» en la capa que no se midió", async ({
  page,
}) => {
  await elegirCaso(page, "passThinNameSinDato");

  await expect(page.getByLabel("Ticker")).toHaveValue("SPCXB");
  await expect(page.getByLabel("Monto en USD")).toHaveValue("45");
  await expect(page.getByLabel("Tope de costo")).toHaveValue("1");
  await expect(page.getByTestId("resultado")).toContainText("Se puede firmar");
  await expect(page.getByTestId("salida-disponibilidad")).toContainText(
    "sin dato",
  );
  await expect(page.getByTestId("salida-ahora")).toContainText("Recuperás");
  await expect(page.getByTestId("regimen")).toContainText(
    "conviene partir la orden",
  );
  const riesgo = page.getByTestId("salida-riesgo");
  await expect(riesgo).toContainText("sin dato");
  await expect(riesgo).not.toContainText("OFF_HOURS_WEEKEND");
});

test("un tope de la frase que no se cumple se anota y la firma sigue a la vista", async ({
  page,
}) => {
  await elegirCaso(page, "passTopeFrase");

  await expect(page.getByLabel("Ticker")).toHaveValue("QQQB");
  await expect(page.getByLabel("Monto en USD")).toHaveValue("200");
  await expect(page.getByLabel("Tope de costo")).toHaveValue("0,3");

  const resultado = page.getByTestId("resultado");
  await expect(resultado).toContainText("Se puede firmar");
  await expect(resultado).toContainText("tope de impacto");
  await expect(page.getByRole("button", { name: "Firmar swap" })).toBeDisabled();
});
