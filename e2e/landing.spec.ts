import { expect, test } from "@playwright/test";

test("la landing cuenta el producto y no tiene formulario", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { level: 1 })).toContainText("Ves la compra.");
  await expect(page.getByLabel("Ticker")).toHaveCount(0);
  await expect(page.getByLabel("Monto en USD")).toHaveCount(0);
  await expect(page.getByLabel("Tope de costo")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Evaluar" })).toHaveCount(0);
});

test("la muestra cambia de ejemplo y el recorrido lo sigue", async ({ page }) => {
  const llamadas: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/api/evaluate")) llamadas.push(request.url());
  });
  await page.goto("/");

  const resultado = page.getByTestId("resultado");
  const recorrido = page.getByTestId("recorrido");

  await expect(page.getByRole("tab", { name: /Pasa/ })).toHaveAttribute("aria-selected", "true");
  await expect(resultado).toContainText("Se puede firmar");
  await expect(recorrido).toHaveAttribute(
    "data-recorrido",
    "passed,passed,passed,passed,passed",
  );
  await expect(page.getByRole("button", { name: "Firmar swap", disabled: false })).toHaveCount(0);

  await page.getByRole("tab", { name: /Corta en la salida/ }).click();
  await expect(resultado).toContainText("No hay transacción");
  await expect(resultado).toContainText("Vender este monto ahora cuesta más del 1%");
  await expect(recorrido).toHaveAttribute(
    "data-recorrido",
    "passed,cut,skipped,skipped,skipped",
  );
  await expect(page.getByRole("button", { name: "Firmar swap", disabled: false })).toHaveCount(0);

  await page.getByRole("tab", { name: /Contrato impostor/ }).click();
  await expect(resultado).toContainText("Este contrato no es el token oficial de ese ticker.");
  await expect(recorrido).toHaveAttribute(
    "data-recorrido",
    "cut,skipped,skipped,skipped,skipped",
  );
  await expect(page.getByRole("button", { name: "Firmar swap", disabled: false })).toHaveCount(0);

  // Con el teclado: la flecha derecha pasa a la pestaña siguiente.
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("tab", { name: /Nombre fino un sábado/ })).toBeFocused();
  await expect(resultado).toContainText("Se puede firmar");

  // Ninguna pestaña deja un botón de firma activo, y la muestra no consulta la red.
  await expect(page.getByRole("button", { name: "Firmar swap" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Firmar swap", disabled: false })).toHaveCount(0);
  expect(llamadas).toHaveLength(0);
});

test("los botones para probar llevan a la app", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("banner").getByRole("link", { name: /Probar/ })).toHaveAttribute(
    "href",
    "/app",
  );
  await expect(page.getByRole("link", { name: /Probar una evaluación/ })).toHaveAttribute(
    "href",
    "/app",
  );

  await page.getByRole("link", { name: /Ver la operación/ }).click();
  await expect(page).toHaveURL(/\/app$/);
  await expect(page.getByLabel("Ticker")).toBeVisible();
});

test.describe("con movimiento reducido", () => {
  test.use({ reducedMotion: "reduce" });

  test("la escena dibuja un cuadro fijo en vez de animar", async ({ page }) => {
    await page.goto("/");
    const recorrido = page.getByTestId("recorrido");
    await expect(recorrido).toHaveAttribute("data-webgl", /si|no/, { timeout: 20_000 });
    const webgl = await recorrido.getAttribute("data-webgl");
    test.skip(webgl !== "si", "el navegador de prueba no tiene WebGL");
    await expect(recorrido).toHaveAttribute("data-movimiento", "reducido");
  });
});

test("en 390px la landing no se desborda y el menú abre la navegación", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");

  const overflows = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
  );
  expect(overflows).toBe(false);

  await page.getByRole("button", { name: "Abrir navegación" }).click();
  await expect(page.getByRole("link", { name: "El producto" })).toBeVisible();
});
