import type { Meta, StoryObj } from "@storybook/html-vite"
import { Effect, Stream, SubscriptionRef } from "effect"
import "@dhtmlx/pivot/dist/pivot.css"
import { element, inside, widgetStory } from "../storybook/story"
import { button } from "./button"
import { column } from "./host"
import { pivot, type PivotConfig, type PivotField } from "./pivot"

/** The Pivot table. The rows and the build of the table are in stores: change the build in the panel, and the store follows. */
const meta: Meta = { title: "Pivot" }
export default meta
type Story = StoryObj

const FIELDS: ReadonlyArray<PivotField> = [
  { id: "region", label: "Region", type: "text" },
  { id: "product", label: "Product", type: "text" },
  { id: "year", label: "Year", type: "number" },
  { id: "sales", label: "Sales", type: "number" }
]

const sales = () => {
  const rows: Array<Record<string, unknown>> = []
  let n = 3
  for (const region of ["North", "South", "East", "West"]) {
    for (const product of ["Apples", "Pears", "Plums"]) {
      for (const year of [2025, 2026]) rows.push({ region, product, year, sales: 10 + ((n = (n * 7 + 5) % 31) % 20) })
    }
  }
  return rows
}

export const Sales: Story = {
  render: () =>
    widgetStory(Effect.gen(function* () {
      const rows = yield* SubscriptionRef.make<ReadonlyArray<Readonly<Record<string, unknown>>>>(sales())
      const config = yield* SubscriptionRef.make<PivotConfig>({ rows: ["region", "product"], columns: ["year"], values: [{ field: "sales", method: "sum" }] })
      const [controls] = yield* column([
        Effect.gen(function* () {
          const row = yield* element("div", "dhxe-row")
          const flip = yield* inside(row, button({ label: "Products in the columns, from the code", color: "secondary" }))
          const more = yield* inside(row, button({ label: "Add a row of data", color: "secondary", view: "link" }))
          const out = yield* element("pre", "dhxe-log")
          return { flip, more, out }
        }),
        pivot({ rows, fields: FIELDS, config })
      ])
      yield* SubscriptionRef.changes(config).pipe(Stream.runForEach((now) => Effect.sync(() => (controls.out.textContent = JSON.stringify(now)))), Effect.forkScoped)
      yield* controls.flip.clicks.pipe(Stream.runForEach(() => SubscriptionRef.set(config, { rows: ["region"], columns: ["product"], values: [{ field: "sales", method: "sum" }] })), Effect.forkScoped)
      yield* controls.more.clicks.pipe(Stream.runForEach(() => SubscriptionRef.update(rows, (all) => [...all, { region: "North", product: "Apples", year: 2026, sales: 100 }])), Effect.forkScoped)
    }))
}
