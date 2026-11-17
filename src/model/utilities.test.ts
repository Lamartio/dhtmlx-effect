import { readFileSync } from "node:fs"
import { it } from "@effect/vitest"
import { expect } from "vitest"
import { Button, Column } from "./nodes"
import { UTILITIES } from "./utilities"

it("takes a spacing or place class on a node, and refuses a class that is not in the list", () => {
  expect(Column.make({ id: "main", classes: ["gap-2", "p-4"], children: [Button.make({ id: "save", label: "Save", classes: ["mx-2", "self-end"] })] }).classes).toEqual(["gap-2", "p-4"])
  expect(() => Button.make({ id: "save", label: "Save", classes: ["bg-red-500"] } as never)).toThrow()
  expect(() => Column.make({ id: "main", classes: ["text-primary"], children: [] } as never)).toThrow()
})

it("has a rule in utilities.css for each class in the list, so the CSS is not older than the list", () => {
  const css = readFileSync(new URL("../utilities.css", import.meta.url), "utf8")
  const missing = UTILITIES.filter((name) => !css.includes(`.${name.replace(".", "\\.")} {`))
  expect(missing).toEqual([])
})
