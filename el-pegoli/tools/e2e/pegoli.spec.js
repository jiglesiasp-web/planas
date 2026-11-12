// Los selectores usan roles y textos, no clases: sobreviven a un rediseño.
const { test, expect } = require("playwright/test");

const TEL = "tel:+34965781035";
let problems;

test.beforeEach(async ({ page }) => {
  problems = [];
  page.on("console", (m) => { if (m.type() === "error") problems.push("console: " + m.text()); });
  page.on("pageerror", (e) => problems.push("pageerror: " + e.message));
  page.on("response", (r) => { if (r.status() >= 400) problems.push(r.status() + " " + r.url()); });
});
test.afterEach(() => { expect(problems, "errores de consola o de red").toEqual([]); });

const sceneStats = (page) => page.evaluate(() => window.__PEGOLI__.scene.stats());
async function openVista(page) {
  await page.goto("/index.html");
  await page.waitForFunction(() => window.__PEGOLI__ && window.__PEGOLI__.scene && window.__PEGOLI__.scene.stats().frames > 2);
  await page.evaluate(() => {
    document.documentElement.style.scrollBehavior = "auto";
    const el = document.querySelector("#vista-3d");
    window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY + 200);
  });
  await page.waitForFunction(() => window.__PEGOLI__.scene.getMode() === "explore");
}

test.describe("F01 reservar por teléfono", () => {
  test("F01-H1 las llamadas a la acción marcan el teléfono del restaurante", async ({ page }) => {
    await page.goto("/index.html");
    await expect(page.getByRole("link", { name: /Reservar · 965 781 035/ })).toHaveAttribute("href", TEL);
    await expect(page.getByRole("banner").getByRole("link", { name: "Reservar" })).toHaveAttribute("href", TEL);
    await expect(page.getByRole("link", { name: "Llamar ahora" })).toHaveAttribute("href", TEL);
    await expect(page.getByText("no admite reservas online")).toBeVisible();
  });
});

test.describe("F02 explorar la vista 3D", () => {
  test("F02-H1 la escena arranca y se muestra", async ({ page }) => {
    await page.goto("/index.html");
    await page.waitForFunction(() => document.querySelector("[data-stage]").classList.contains("is-live"));
    const s = await sceneStats(page);
    expect(s.triangles).toBeGreaterThan(10000);
    await expect(page.locator("html")).not.toHaveClass(/no-webgl/);
  });

  test("F02-H2 elegir un punto de vista mueve la cámara y cambia el texto", async ({ page }) => {
    await openVista(page);
    const before = (await sceneStats(page)).camera;
    await page.getByRole("group", { name: "Puntos de vista" }).getByRole("button", { name: "La terraza" }).click();
    await expect(page.getByRole("group", { name: "Puntos de vista" }).getByRole("button", { name: "La terraza" })).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByText(/sombrillas de brezo sobre losas de piedra/)).toBeVisible();
    await expect.poll(async () => (await sceneStats(page)).camera[1], { timeout: 150000 }).toBeLessThan(8);
    expect((await sceneStats(page)).camera).not.toEqual(before);
  });

  test("F02-H3 cambiar la luz actualiza la escena y los dos selectores", async ({ page }) => {
    await openVista(page);
    await page.getByRole("group", { name: "Luz del día" }).getByRole("button", { name: "Noche" }).click();
    await expect(page.locator("body")).toHaveAttribute("data-time", "noche");
    expect((await sceneStats(page)).time).toBe("noche");
    await expect(page.getByRole("group", { name: "Luz de la recreación 3D" }).getByRole("button", { name: "Noche" })).toHaveAttribute("aria-pressed", "true");
  });

  test("F02-H4 arrastrar gira la maqueta", async ({ page }) => {
    await openVista(page);
    await page.waitForFunction(() => !window.__PEGOLI__.scene.stats().busy, null, { timeout: 150000 }); // termina el vuelo hasta la vista general
    const before = (await sceneStats(page)).camera;
    const vp = page.viewportSize();
    await page.mouse.move(vp.width / 2, vp.height / 2);
    await page.mouse.down();
    await page.mouse.move(vp.width / 2 + 260, vp.height / 2, { steps: 8 });
    await page.mouse.up();
    await expect.poll(async () => Math.abs((await sceneStats(page)).camera[0] - before[0]), { timeout: 60000 }).toBeGreaterThan(3);
  });

  test("F02-E1 con teclado: flechas giran y + acerca", async ({ page }) => {
    await openVista(page);
    await page.waitForFunction(() => !window.__PEGOLI__.scene.stats().busy, null, { timeout: 150000 });
    const before = (await sceneStats(page)).camera;
    await page.getByRole("img", { name: /Recreación 3D interactiva/ }).focus();
    await page.keyboard.press("ArrowLeft");
    await page.keyboard.press("ArrowLeft");
    await page.keyboard.press("+");
    await expect.poll(async () => JSON.stringify((await sceneStats(page)).camera), { timeout: 30000 }).not.toBe(JSON.stringify(before));
  });

  test("F02-N1 sin WebGL se muestra la imagen de la recreación y el aviso", async ({ browser }) => {
    const ctx = await browser.newContext();
    await ctx.addInitScript(() => { HTMLCanvasElement.prototype.getContext = () => null; });
    const page = await ctx.newPage();
    await page.goto("/index.html");
    await expect(page.locator("html")).toHaveClass(/no-webgl/);
    await expect(page.getByRole("heading", { level: 1, name: "El Pegolí" })).toBeVisible();
    await page.evaluate(() => { document.documentElement.style.scrollBehavior = "auto"; document.querySelector("#vista-3d").scrollIntoView(); });
    await expect(page.getByText(/no puede mostrar la vista 3D interactiva/)).toBeVisible();
    await ctx.close();
  });
});

test.describe("F05 recorrido guiado", () => {
  const goTo = (page, id) => page.evaluate((id) => {
    document.documentElement.style.scrollBehavior = "auto";
    const el = document.querySelector(id), r = el.getBoundingClientRect();
    window.scrollTo(0, r.top + window.scrollY + (r.height - window.innerHeight) / 2);
  }, id);

  test("F05-H1 al bajar, la cámara entra al comedor y la luz cambia con el capítulo", async ({ page }) => {
    await page.goto("/index.html");
    await page.waitForFunction(() => window.__PEGOLI__ && window.__PEGOLI__.scene && window.__PEGOLI__.scene.stats().frames > 2);
    expect((await sceneStats(page)).mode).toBe("tour");
    await goTo(page, "#cocina");
    await expect(page.getByRole("heading", { name: "Gamba roja de Dénia" })).toBeVisible();
    // la mesa del comedor: dentro del edificio, a la altura de los ojos
    await expect.poll(async () => { const c = (await sceneStats(page)).camera; return c[0] > 12 && c[0] < 25 && c[1] > 4.8 && c[1] < 6.5 && c[2] > -8 && c[2] < 3; }, { timeout: 240000 }).toBe(true);
    await goTo(page, "#visita");
    await expect(page.locator("body")).toHaveAttribute("data-time", "noche");
    await expect.poll(async () => (await sceneStats(page)).time).toBe("noche");
  });
});

test.describe("F03 horario y dirección", () => {
  test("F03-H1 horario, dirección y mapa", async ({ page }) => {
    await page.goto("/index.html");
    const horario = page.getByRole("table", { name: /Horario de apertura/ });
    await expect(horario).toContainText("Octubre a junio");
    await expect(horario).toContainText("12:00 – 16:00");
    await expect(horario).toContainText("20:30 – 22:30");
    await expect(page.locator("#visita address")).toContainText("Carrer Fènix, 13");
    await expect(page.getByRole("link", { name: "Abrir en Google Maps" })).toHaveAttribute("href", /google\.com\/maps/);
  });
});

test.describe("F04 navegación", () => {
  test("F04-H1 el menú lleva a cada sección", async ({ page }) => {
    await page.goto("/index.html");
    await page.getByRole("navigation", { name: "Secciones", exact: true }).getByRole("link", { name: "Carta" }).click();
    await expect(page.getByRole("heading", { name: /De la lonja de Dénia/ })).toBeInViewport({ timeout: 20000 });
  });

  test("F04-E1 móvil: menú desplegable y sin desbordes horizontales", async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const page = await ctx.newPage();
    await page.goto("/index.html");
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
    await page.getByRole("button", { name: "Abrir menú" }).click();
    await page.getByRole("navigation", { name: "Secciones (móvil)" }).getByRole("link", { name: "Horario y reservas" }).click();
    await expect(page.getByRole("navigation", { name: "Secciones (móvil)" })).toBeHidden();
    await expect(page.getByRole("link", { name: "965 781 035", exact: true })).toBeInViewport({ timeout: 20000 });
    await ctx.close();
  });
});

test.describe("Robustez", () => {
  test("R01 sin JavaScript todo el contenido se lee", async ({ browser }) => {
    const ctx = await browser.newContext({ javaScriptEnabled: false });
    const page = await ctx.newPage();
    await page.goto("/index.html");
    for (const name of [/El Pegolí/, /mismo mar/, /a un paso del agua/, /De la lonja de Dénia/, /Dénia al fondo/, /se cena fuera/, /por teléfono/, /a tu aire/]) {
      await expect(page.getByRole("heading", { name }).first()).toBeVisible();
    }
    await expect(page.getByRole("link", { name: "Llamar ahora" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Arròs a banda", exact: true })).toBeVisible();
    await ctx.close();
  });

  test("R02 con movimiento reducido el contenido sigue apareciendo", async ({ browser }) => {
    const ctx = await browser.newContext({ reducedMotion: "reduce" });
    const page = await ctx.newPage();
    await page.goto("/index.html");
    await page.evaluate(() => { document.documentElement.style.scrollBehavior = "auto"; document.querySelector("#cocina").scrollIntoView(); });
    await expect(page.getByRole("heading", { name: "Gamba roja de Dénia" })).toBeVisible();
    await expect(page.locator("#cocina [data-reveal]").first()).toHaveClass(/is-revealed/);
    await ctx.close();
  });

  test("R03 accesibilidad: sin infracciones de axe", async ({ page }) => {
    let axePath;
    try { axePath = require.resolve("axe-core/axe.min.js"); } catch (e) { test.skip(true, "axe-core no instalado"); }
    await page.goto("/index.html");
    await page.evaluate(async () => {
      document.documentElement.style.scrollBehavior = "auto";
      for (let y = 0; y < document.documentElement.scrollHeight; y += 500) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 60)); }
      window.scrollTo(0, 0);
    });
    await page.waitForTimeout(1500);
    await page.addScriptTag({ path: axePath });
    const result = await page.evaluate(() => window.axe.run(document, { runOnly: ["wcag2a", "wcag2aa", "wcag21aa"] }));
    const summary = result.violations.map((v) => v.id + " (" + v.nodes.length + "): " + v.nodes.slice(0, 3).map((n) => n.target.join(" ")).join(" | "));
    expect(summary).toEqual([]);
  });
});
