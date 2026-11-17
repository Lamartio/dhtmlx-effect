import { playwright } from "@vitest/browser-playwright"
import { defineConfig } from "vitest/config"
import { existsSync } from "node:fs"

/** A Chromium that some containers ship at a fixed place. Elsewhere Playwright finds its own. */
const CHROMIUM = "/opt/pw-browsers/chromium"

// The models have no DHTMLX, so they run in Node. The widgets run in Chromium, as DHTMLX Gantt does
// not run in happy-dom. The look is checked in Storybook.
export default defineConfig({
  test: {
    testTimeout: 30_000,
    projects: [
      { test: { name: "model", include: ["src/model/**/*.test.ts"], environment: "node" } },
      {
        test: {
          name: "browser",
          include: ["src/**/*.test.ts"],
          exclude: ["src/model/**"],
          browser: {
            enabled: true,
            headless: true,
            provider: playwright({ launchOptions: existsSync(CHROMIUM) ? { executablePath: CHROMIUM } : {} }),
            instances: [{ browser: "chromium" }]
          }
        }
      }
    ]
  }
})
