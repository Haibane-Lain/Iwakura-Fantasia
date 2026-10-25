import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { _electron as electron, expect, test } from "@playwright/test";

const appDir = resolve(process.cwd(), "apps/desktop");
const electronPath = resolve(appDir, "node_modules/electron/dist/electron.exe");

test("creates a character, explores Redford and the crypt, trades, and finishes a quest", async () => {
  test.setTimeout(120_000);
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

    // Enter Redford and accept Hessa's quest through authored dialogue.
    await window.getByRole("button", { name: "Enter Redford" }).click();
    await expect(window.getByText("People here")).toBeVisible({ timeout: 10_000 });
    await window.locator("canvas").first().waitFor();
    await window
      .getByRole("button", { name: /Talk to Hessa Vale/ })
      .first()
      .click();
    await expect(window.getByRole("heading", { name: "Hessa Vale" })).toBeVisible();
    await window.getByRole("button", { name: /I'll go to the crypt and find your ledger/ }).click();
    await expect(window.getByText(/Quest accepted: The Mill That Stopped/).first()).toBeVisible();
    await window.getByRole("button", { name: "Close", exact: true }).click();

    await window.getByRole("button", { name: "Journal" }).click();
    await expect(window.getByRole("heading", { name: "Quest Journal" })).toBeVisible();
    await expect(window.getByText("The Mill That Stopped").first()).toBeVisible();
    await window.getByRole("button", { name: "Close", exact: true }).click();

    // Buy and sell at the market. The engine owns stock and gold.
    await window
      .getByRole("button", { name: /Trade at Redford Market/ })
      .first()
      .click();
    await expect(window.getByRole("heading", { name: "Bryn's Stall" })).toBeVisible();
    await window.getByRole("button", { name: "Buy Torch" }).click();
    await expect(window.getByText(/Bought Torch/).first()).toBeVisible();
    await window.getByRole("button", { name: "Sell", exact: true }).click();
    await window.getByRole("button", { name: "Sell Torch" }).click();
    await expect(window.getByText(/Sold Torch/).first()).toBeVisible();
    await window.getByRole("button", { name: "Close", exact: true }).click();

    // The quest acceptance reveals the crypt as a known nearby landmark.
    await window
      .getByRole("button", { name: /Leave via South Road/ })
      .first()
      .click();
    await expect(window.getByText("Travel Map").first()).toBeVisible({ timeout: 10_000 });
    await expect(window.getByText("Road edges").first()).toBeVisible();
    await expect(window.getByText("WASD", { exact: true }).first()).toBeVisible();
    // Screen-relative movement: the Redford gate sits east of the outside hex,
    // which projects down-right on screen, so D+S walks back through it.
    await window.keyboard.down("d");
    await window.keyboard.down("s");
    await window.waitForTimeout(550);
    await window.keyboard.up("s");
    await window.keyboard.up("d");
    await expect(window.getByText("People here").first()).toBeVisible({ timeout: 10_000 });
    await window
      .getByRole("button", { name: /Leave via South Road/ })
      .first()
      .click();
    await expect(window.getByText("Travel Map").first()).toBeVisible({ timeout: 10_000 });
    await window.getByRole("button", { name: "Atlas" }).click();
    await expect(window.getByText("Nearby landmarks").first()).toBeVisible();
    await window.getByRole("button", { name: /The Old Mill Crypt/ }).click();
    await window.getByRole("button", { name: "Fast travel" }).click();
    await expect(window.getByText("Travel Map").first()).toBeVisible({ timeout: 20_000 });
    await window.getByRole("button", { name: "Enter The Old Mill Crypt" }).click();
    await expect(window.getByText("The Old Mill Crypt").first()).toBeVisible({ timeout: 10_000 });

    // Walk the dungeon, trigger the encounter stub, recover the ledger.
    await window.getByRole("button", { name: "Walk to Mill ledger" }).click();
    await expect(window.getByRole("button", { name: "Examine Mill ledger" }).first()).toBeVisible({
      timeout: 10_000,
    });

    // The dungeon encounter offers a tactical battle. Fight briefly, then retreat.
    await window.getByRole("button", { name: /Fight Shades in the undercroft/ }).click();
    await expect(window.getByText("Battle").first()).toBeVisible({ timeout: 10_000 });
    for (let turn = 0; turn < 4; turn += 1) {
      const resolve = window.getByRole("button", { name: /Resolve / });
      if ((await resolve.count()) === 0) break;
      await resolve.first().click();
      await window.waitForTimeout(100);
    }
    await window.getByRole("button", { name: "Retreat" }).click();
    await expect(window.getByText("retreated").first()).toBeVisible({ timeout: 10_000 });
    await window.getByRole("button", { name: "Return to the road" }).click();
    await expect(window.getByText("Points of interest").first()).toBeVisible({ timeout: 10_000 });

    await window.getByRole("button", { name: "Walk to Mill ledger" }).click();
    await expect(window.getByRole("button", { name: "Examine Mill ledger" }).first()).toBeVisible({
      timeout: 10_000,
    });
    await window.getByRole("button", { name: "Examine Mill ledger" }).first().click();
    await expect(window.getByText(/You take the Mill Ledger/).first()).toBeVisible();
    await window.getByRole("button", { name: "Journal" }).click();
    await expect(window.getByText("ready to turn in").first()).toBeVisible();
    await window.getByRole("button", { name: "Close", exact: true }).click();

    // Return to Redford and turn in the quest.
    await window
      .getByRole("button", { name: /Leave via Stairs to the surface/ })
      .first()
      .click();
    await expect(window.getByText("Travel Map").first()).toBeVisible({ timeout: 10_000 });
    await expect(window.getByText("Road edges").first()).toBeVisible();
    await expect(window.getByText("WASD", { exact: true }).first()).toBeVisible();
    await window.getByRole("button", { name: "Atlas" }).click();
    await expect(window.getByText("Nearby landmarks").first()).toBeVisible();
    await window
      .getByRole("button", { name: /Redford/ })
      .first()
      .click();
    await window.getByRole("button", { name: "Fast travel" }).click();
    await expect(window.getByText("Travel Map").first()).toBeVisible({ timeout: 20_000 });
    await window.getByRole("button", { name: "Enter Redford" }).click();
    await expect(window.getByText("People here")).toBeVisible();
    await window
      .getByRole("button", { name: /Talk to Hessa Vale/ })
      .first()
      .click();
    await window.getByRole("button", { name: /Hand over the ledger/ }).click();
    await expect(window.getByText(/Quest complete: The Mill That Stopped/).first()).toBeVisible();
    await window.getByRole("button", { name: "Close", exact: true }).click();
    await window.getByRole("button", { name: "Journal" }).click();
    await window.getByRole("button", { name: "Completed" }).click();
    await expect(window.getByText("The Mill That Stopped").first()).toBeVisible();
    await window.getByRole("button", { name: "Close", exact: true }).click();

    // Save the local state and verify that Continue restores it.
    await window.getByRole("button", { name: "Save", exact: true }).click();
    await window.locator("nav").getByRole("button", { name: "Chronicle" }).click();
    await expect(window.getByText("Saved chronicle").first()).toBeVisible();
    await window.getByRole("button", { name: "Continue" }).click();
    await expect(window.getByText("People here")).toBeVisible({ timeout: 10_000 });

    await window.locator("nav").getByRole("button", { name: "AI Lab" }).click();
    await expect(window.getByRole("heading", { name: "AI Lab" })).toBeVisible();
    await expect(window.getByText("Narration workbench").first()).toBeVisible();

    await window.locator("nav").getByRole("button", { name: "Settings" }).click();
    await expect(window.getByRole("heading", { name: "Settings" })).toBeVisible();
    await expect(window.getByText("Model routing").first()).toBeVisible();

    // Exercise the OS-encrypted keystore only when no real key is configured,
    // so running E2E locally never deletes the developer's key.
    const keyAlreadyConfigured = await window
      .getByText("configured", { exact: true })
      .first()
      .isVisible()
      .catch(() => false);
    if (!keyAlreadyConfigured) {
      await window.locator("#api-key").fill("test-dummy-key-12345678");
      await window.getByRole("button", { name: "Store key" }).click();
      await expect(window.getByText("configured", { exact: true }).first()).toBeVisible({
        timeout: 15_000,
      });
      await window.getByRole("button", { name: "Remove" }).click();
      await expect(window.getByText("missing", { exact: true }).first()).toBeVisible({ timeout: 10_000 });

      // With no key, the lab must surface a clean configuration error.
      await window.locator("nav").getByRole("button", { name: "AI Lab" }).click();
      await window.getByRole("button", { name: "Send turn" }).click();
      await expect(window.getByText("OpenCode Go API key is not configured").first()).toBeVisible({
        timeout: 10_000,
      });
    }

    await window.locator("nav").getByRole("button", { name: "Chronicle" }).click();
    await expect(window.getByText("Iwakura").first()).toBeVisible();
  } finally {
    await app.close();
  }

  expect(pageErrors, `Renderer errors: ${pageErrors.join("\n")}`).toEqual([]);
});
