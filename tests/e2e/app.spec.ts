import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { _electron as electron, expect, test } from "@playwright/test";

const appDir = resolve(process.cwd(), "apps/desktop");
const electronPath = resolve(appDir, "node_modules/electron/dist/electron.exe");

test("creates a character, explores Redford Reach, saves, and navigates the M2 screens", async () => {
  expect(existsSync(electronPath), "Electron binary is installed").toBe(true);
  expect(
    existsSync(resolve(appDir, "out/main/index.js")),
    "Run `pnpm --filter @iwakura/desktop build` before E2E tests",
  ).toBe(true);

  const app = await electron.launch({
    executablePath: electronPath,
    args: ["."],
    cwd: appDir,
    env: { ...process.env, IWAKURA_CAPTURE: "" },
  });

  const pageErrors: string[] = [];

  try {
    const window = await app.firstWindow();
    window.on("pageerror", (error) => pageErrors.push(error.message));
    window.on("dialog", (dialog) => void dialog.accept());
    await window.waitForLoadState("domcontentloaded");
    await window.waitForSelector("text=Chronicle status");

    await expect(window.getByText("SQLite · WAL").first()).toBeVisible();
    await expect(window.getByText("OpenCode Go").first()).toBeVisible();

    // A handcrafted world is deterministic and has known nearby landmarks.
    await window.locator("nav").getByRole("button", { name: "New Campaign" }).click();
    await expect(window.getByRole("heading", { name: "New Chronicle" })).toBeVisible();
    await window.getByRole("button", { name: /Handcrafted/ }).click();
    await window.getByRole("button", { name: "Generate world" }).click();
    await expect(window.getByText(/Redford Reach passed all hard checks/)).toBeVisible({ timeout: 15_000 });
    await window.getByRole("button", { name: "Choose character" }).click();

    // Character creation: Dwarf Fighter Soldier, default point buy.
    await expect(window.getByRole("heading", { name: "Shape a Wanderer" })).toBeVisible();
    await window.getByRole("button", { name: /Dwarf/ }).click();
    await window.getByRole("button", { name: "Next" }).click();
    await window.getByRole("button", { name: /Fighter/ }).click();
    await window.getByRole("button", { name: "Next" }).click();
    await window.getByRole("button", { name: /Soldier/ }).click();
    await window.getByRole("button", { name: "Next" }).click();
    await window.getByRole("button", { name: "Next" }).click();
    await window.getByRole("button", { name: "Next" }).click();
    await window.getByRole("button", { name: "Next" }).click();
    await window.locator("#character-name").fill("Ardan Vell");
    await window.getByRole("button", { name: "Next" }).click();
    await window.getByRole("button", { name: "Begin chronicle" }).click();

    await expect(window.getByText("Selected hex").first()).toBeVisible({ timeout: 10_000 });
    await expect(window.getByText("Nearby landmarks").first()).toBeVisible();
    await expect(window.locator("canvas").first()).toBeVisible();

    // The character sheet exposes derived stats, equipment, and skill rolls.
    await window.getByRole("button", { name: "Character" }).click();
    await expect(window.getByRole("heading", { name: "Ardan Vell" })).toBeVisible();
    await window.getByRole("button", { name: "Skills" }).click();
    await expect(window.getByText("Athletics").first()).toBeVisible();
    await window.getByRole("button", { name: "Roll" }).first().click();
    await expect(window.getByText(/d20 \d+/).first()).toBeVisible();
    await window.getByRole("button", { name: "Close", exact: true }).click();

    await window.getByRole("button", { name: /Millbrook/ }).click();
    await window.getByRole("button", { name: "Travel" }).click();
    await expect(window.getByText("The party is here.").first()).toBeVisible({ timeout: 10_000 });
    await window.getByRole("button", { name: "Save now" }).click();
    await expect(window.getByText(/^Saved /).first()).toBeVisible({ timeout: 10_000 });

    await window.locator("nav").getByRole("button", { name: "Chronicle" }).click();
    await expect(window.getByText("Saved chronicle").first()).toBeVisible();
    await window.getByRole("button", { name: "Continue" }).click();
    await expect(window.getByText("Selected hex").first()).toBeVisible();

    await window.locator("nav").getByRole("button", { name: "AI Lab" }).click();
    await expect(window.getByRole("heading", { name: "AI Lab" })).toBeVisible();
    await expect(window.getByText("Narration workbench").first()).toBeVisible();

    await window.locator("nav").getByRole("button", { name: "Settings" }).click();
    await expect(window.getByRole("heading", { name: "Settings" })).toBeVisible();
    await expect(window.getByText("Model routing").first()).toBeVisible();

    // Exercise the OS-encrypted keystore and the settings round-trip with a
    // deliberately invalid key. It is removed again in the same test.
    await window.locator("#api-key").fill("test-dummy-key-12345678");
    await window.getByRole("button", { name: "Store key" }).click();
    await expect(window.getByText("configured").first()).toBeVisible({ timeout: 15_000 });
    await window.getByRole("button", { name: "Remove" }).click();
    await expect(window.getByText("missing").first()).toBeVisible({ timeout: 10_000 });

    // With no key, the lab must surface a clean configuration error.
    await window.locator("nav").getByRole("button", { name: "AI Lab" }).click();
    await window.getByRole("button", { name: "Send turn" }).click();
    await expect(window.getByText("OpenCode Go API key is not configured").first()).toBeVisible({
      timeout: 10_000,
    });

    await window.locator("nav").getByRole("button", { name: "Chronicle" }).click();
    await expect(window.getByText("Iwakura").first()).toBeVisible();
  } finally {
    await app.close();
  }

  expect(pageErrors, `Renderer errors: ${pageErrors.join("\n")}`).toEqual([]);
});
