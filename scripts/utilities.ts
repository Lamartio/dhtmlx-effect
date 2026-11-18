/**
 * Builds `src/utilities.css`: the CSS of the classes in `UTILITIES`, and nothing else. Tailwind
 * gets the list itself, so the CSS and the Schema cannot drift. No preflight, no layer, and the
 * theme inline (`reference`: no variables on :root), so the file does not change the theme of a page
 * that has Tailwind of its own. Run it after a change of the list: `bun run utilities`.
 */
import { compile } from "@tailwindcss/node"
import { UTILITIES } from "../src/model/utilities"

const input = `@import "tailwindcss/theme.css" theme(inline reference);\n@tailwind utilities;\n`
const compiler = await compile(input, { base: import.meta.dir, onDependency: () => {} })
const header = "/* Made by scripts/utilities.ts from src/model/utilities.ts: do not change it by hand. */\n"
await Bun.write(new URL("../src/utilities.css", import.meta.url), header + compiler.build([...UTILITIES]))
