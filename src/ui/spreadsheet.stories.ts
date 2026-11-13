import type { Meta, StoryObj } from "@storybook/html-vite"
import { Effect, Stream, SubscriptionRef } from "effect"
import "@dhtmlx/spreadsheet/codebase/spreadsheet.min.css"
import { element, inside, widgetStory } from "../storybook/story"
import { button } from "./button"
import { column, Host } from "./host"
import { spreadsheet, type SpreadsheetData } from "./spreadsheet"

/** The Spreadsheet. The cells are in a store: edit a cell, and the store follows. */
const meta: Meta = { title: "Products/Spreadsheet" }
export default meta
type Story = StoryObj

const cells = (): SpreadsheetData => [
  { cell: "A1", value: "Product" },
  { cell: "B1", value: "Price" },
  { cell: "C1", value: "Count" },
  { cell: "D1", value: "Total" },
  { cell: "A2", value: "Apples" },
  { cell: "B2", value: 1.2 },
  { cell: "C2", value: 10 },
  { cell: "D2", value: "=B2*C2" },
  { cell: "A3", value: "Pears" },
  { cell: "B3", value: 1.5 },
  { cell: "C3", value: 4 },
  { cell: "D3", value: "=B3*C3" },
  { cell: "A4", value: "Sum" },
  { cell: "D4", value: "=SUM(D2:D3)" }
]

export const Sheet: Story = {
  render: () =>
    widgetStory(Effect.gen(function* () {
      const data = yield* SubscriptionRef.make(cells())
      const [controls] = yield* column([
        Effect.gen(function* () {
          const row = yield* element("div", "dhxe-row")
          const reset = yield* inside(row, button({ label: "Set the first cells again, from the code", color: "secondary" }))
          const out = yield* element("pre", "dhxe-log")
          return { reset, out }
        }),
        Effect.gen(function* () {
          const host = yield* Host
          host.style.minHeight = "420px"
          return yield* spreadsheet({ data, rowsCount: 30, colsCount: 10 })
        })
      ])
      let edits = -1
      yield* SubscriptionRef.changes(data).pipe(Stream.runForEach(() => Effect.sync(() => (controls.out.textContent = `${++edits} changes of the store since the start`))), Effect.forkScoped)
      yield* controls.reset.clicks.pipe(Stream.runForEach(() => SubscriptionRef.set(data, cells())), Effect.forkScoped)
    }))
}
