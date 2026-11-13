/**
 * Runs the widget tests in Chromium, as DHTMLX Gantt does not run in happy-dom. A machine with no
 * Chromium for Playwright skips them with a note and exit code 0; `--require-browser` makes that an
 * error, for CI.
 */
import { existsSync } from "node:fs"

const browser = async () => {
  if (existsSync("/opt/pw-browsers/chromium")) return true
  try {
    const { chromium } = await import("playwright")
    return existsSync(chromium.executablePath())
  } catch {
    return false
  }
}

const required = process.argv.includes("--require-browser")
if (!(await browser())) {
  if (required) {
    console.error("dhtmlx-effect: no Chromium for Playwright here. Run: bunx playwright install chromium")
    process.exit(1)
  }
  console.log("dhtmlx-effect: no Chromium for Playwright here, so the widget tests are skipped.")
  process.exit(0)
}
const run = Bun.spawnSync(["bun", "--bun", "vitest", "run", ...process.argv.slice(2).filter((arg) => arg !== "--require-browser")], { stdio: ["inherit", "inherit", "inherit"] })
process.exit(run.exitCode ?? 1)
