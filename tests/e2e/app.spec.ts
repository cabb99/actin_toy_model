import { expect, test } from "@playwright/test";

test("loads the app and paints the canvas", async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });

  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Actin bundle toy model" })).toBeVisible();
  await expect(page.locator("#readout")).toContainText("filaments", { timeout: 10_000 });
  await expect(page.locator("#readout")).toContainText("paused");
  await expect(page.locator("#readout")).toContainText("crosslinker/actin=");
  await expect(page.locator("#pauseBtn")).toContainText("Resume");

  const nonBlank = await page.locator("#canvas").evaluate((canvas) => {
    const c = canvas as HTMLCanvasElement;
    const ctx = c.getContext("2d");
    if (!ctx) return false;
    const { data } = ctx.getImageData(0, 0, Math.min(80, c.width), Math.min(80, c.height));
    return Array.from(data).some((value, i) => i % 4 !== 3 && value !== 0);
  });
  expect(nonBlank).toBe(true);
  expect(consoleErrors).toEqual([]);
});

test("controls update labels and display toggles stay stable", async ({ page }) => {
  await page.goto("/");
  await page.locator("#rings").evaluate((el) => {
    const input = el as HTMLInputElement;
    input.value = "3";
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await expect(page.locator("#ringsVal")).toContainText("3 (37 filaments)");

  await page.locator("#faceToggle").click();
  await expect(page.locator("#faceToggle")).toHaveClass(/on/);
  await expect(page.locator("#legend")).toContainText("Angle color");
  await expect(page.locator("#legend")).toContainText("Directions");

  await page.locator("#faceArrowToggle").click();
  await expect(page.locator("#faceArrowToggle")).toHaveClass(/on/);
  await expect(page.locator("#legend")).toContainText("Face arrows");

  await page.locator("#registryToggle").click();
  await expect(page.locator("#registryToggle")).toHaveClass(/on/);
  await expect(page.locator("#legend")).toContainText("Registry color follows");

  await page.locator("#bendKAngleLog10").evaluate((el) => {
    const input = el as HTMLInputElement;
    input.value = "4";
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await expect(page.locator("#bendKAngleLog10Val")).toContainText("1.00e+4");

  await page.locator("#highlightFilament").selectOption("0");
  await expect(page.locator("#readout")).toContainText("selected filament 0");

  await page.locator("#sideViewBtn").click();
  const sideViewStillPaints = await page.locator("#canvas").evaluate((canvas) => {
    const c = canvas as HTMLCanvasElement;
    const ctx = c.getContext("2d");
    if (!ctx) return false;
    const { data } = ctx.getImageData(0, 0, Math.min(80, c.width), Math.min(80, c.height));
    return Array.from(data).some((value, i) => i % 4 !== 3 && value !== 0);
  });
  expect(sideViewStillPaints).toBe(true);

  await page.locator("#topViewBtn").click();
  const topViewStillPaints = await page.locator("#canvas").evaluate((canvas) => {
    const c = canvas as HTMLCanvasElement;
    const ctx = c.getContext("2d");
    if (!ctx) return false;
    const { data } = ctx.getImageData(0, 0, Math.min(80, c.width), Math.min(80, c.height));
    return Array.from(data).some((value, i) => i % 4 !== 3 && value !== 0);
  });
  expect(topViewStillPaints).toBe(true);
});

test("monte carlo switches registry mode to custom", async ({ page }) => {
  await page.goto("/");
  await page.locator('.tabs .tab[data-tab="mc"]').click();
  await page.locator("#mcT0").evaluate((el) => {
    const input = el as HTMLInputElement;
    input.value = "12";
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await page.locator("#mcT1").evaluate((el) => {
    const input = el as HTMLInputElement;
    input.value = "0.02";
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await page.locator("#mcIters").evaluate((el) => {
    const input = el as HTMLInputElement;
    input.value = "500";
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await page.locator("#mcBtn").click();
  await expect(page.locator("#registryMode")).toHaveValue("custom", { timeout: 20_000 });
  await expect(page.locator("#mcGraph")).toContainText("Temperature");
  await expect(page.locator("#mcGraph")).toContainText("Connections");
  await expect(page.locator("#mcGraph")).toContainText("T 12.00 to 0.020");
  await expect(page.locator("#mcGraph")).toContainText("iters 500");
});

test("bend sweep populates the table and downloads csv", async ({ page }) => {
  await page.goto("/");
  await page.locator("#rings").evaluate((el) => {
    const input = el as HTMLInputElement;
    input.value = "1";
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await page.locator("#monomers").evaluate((el) => {
    const input = el as HTMLInputElement;
    input.value = "24";
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
  // Dynamics panel is hidden in the default UI but still mounted; expose it
  // so the sweep button is actionable.
  await page.locator('[data-panel="dynamics"]').evaluate((el) => {
    (el as HTMLElement).hidden = false;
  });
  const downloadPromise = page.waitForEvent("download");
  await page.locator("#sweepBtn").click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("actin_bundle_3pb.csv");
  await expect(page.locator("#sweepTable")).toContainText("fit EI", { timeout: 30_000 });
});
