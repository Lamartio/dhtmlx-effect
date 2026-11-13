import { it } from "@effect/vitest"
import { Effect, SubscriptionRef } from "effect"
import { expect } from "vitest"
import "@dhtmlx/spreadsheet/codebase/spreadsheet.min.css"
import { Browser, setFacts } from "./browser"
import { alive, Host } from "./host"
import { spreadsheet, type SpreadsheetCell, type SpreadsheetData } from "./spreadsheet"
import { run, settle } from "./wx-test"

const CELLS: ReadonlyArray<SpreadsheetCell> = [
  { cell: "A1", value: "Apples" },
  { cell: "B1", value: 10 },
  { cell: "A2", value: "Pears" },
  { cell: "B2", value: 5 },
  { cell: "B3", value: "=SUM(B1:B2)" }
]

/** The cells of what the Spreadsheet gives back: a list, or an object with the list in it. */
const cellsOf = (data: SpreadsheetData): ReadonlyArray<SpreadsheetCell> => {
  if (Array.isArray(data)) return data as ReadonlyArray<SpreadsheetCell>
  const whole = data as { readonly data?: ReadonlyArray<SpreadsheetCell>; readonly sheets?: ReadonlyArray<{ readonly data?: ReadonlyArray<SpreadsheetCell> }> }
  return whole.data ?? whole.sheets?.[0]?.data ?? []
}

it.live("shows the cells of the store with their formulas, and a new value from the code", () =>
  run(Effect.gen(function* () {
    const data = yield* SubscriptionRef.make<SpreadsheetData>(CELLS)
    const made = yield* spreadsheet({ data, rowsCount: 20, colsCount: 8 })
    yield* settle
    expect(made.spreadsheet.getValue("A1")).toBe("Apples")
    expect(made.spreadsheet.getValue("B3")).toBe(15)
    // The sheet only showed the cells: the store has the same value.
    expect(yield* SubscriptionRef.get(data)).toBe(CELLS)

    yield* SubscriptionRef.set(data, [{ cell: "A1", value: "Plums" }, { cell: "B1", value: 2 }])
    yield* settle
    expect(made.spreadsheet.getValue("A1")).toBe("Plums")
    expect((yield* SubscriptionRef.get(alive)).get("spreadsheet")).toBe(1)
  })))

it.live("writes an edit of a cell into the store", () =>
  run(Effect.gen(function* () {
    const data = yield* SubscriptionRef.make<SpreadsheetData>(CELLS)
    const made = yield* spreadsheet({ data, rowsCount: 20, colsCount: 8 })
    yield* settle
    made.spreadsheet.setValue("B2", 25)
    yield* settle
    const stored = cellsOf(yield* SubscriptionRef.get(data))
    expect(stored.find((one) => one.cell === "B2")?.value).toBe(25)
    expect(made.spreadsheet.getValue("B3")).toBe(35)
  })))

it.live("follows the dark mode of the Browser", () =>
  run(Effect.gen(function* () {
    const host = yield* Host
    const browser = yield* Browser
    yield* spreadsheet({ data: yield* SubscriptionRef.make<SpreadsheetData>(CELLS), rowsCount: 20, colsCount: 8 })
    yield* settle
    expect(host.getAttribute("data-dhx-theme")).toBe("light")
    yield* setFacts(browser, { dark: true })
    yield* settle
    expect(host.getAttribute("data-dhx-theme")).toBe("dark")
  })))
