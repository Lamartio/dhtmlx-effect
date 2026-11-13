import type { Meta, StoryObj } from "@storybook/html-vite"
import { Effect, Stream, SubscriptionRef } from "effect"
import { element, inside, widgetStory } from "../storybook/story"
import { button } from "./button"
import { chart, type ChartConfig, type ChartType } from "./chart"
import { dataCollection, grid } from "./data"
import { column } from "./host"
import { layout } from "./layout"

/**
 * The Chart of the Suite. The rows are in a store: a change of a row moves its point, and a new
 * config changes the type, and the chart stays the same object.
 */
const meta: Meta = { title: "Suite/Chart" }
export default meta
type Story = StoryObj

type Month = { readonly id: string; readonly month: string; readonly planned: number; readonly done: number; readonly color: string }

const months = (): ReadonlyArray<Month> => [
  { id: "jan", month: "Jan", planned: 20, done: 14, color: "#5E83BA" },
  { id: "feb", month: "Feb", planned: 24, done: 22, color: "#81C4E8" },
  { id: "mar", month: "Mar", planned: 30, done: 19, color: "#74A2E7" },
  { id: "apr", month: "Apr", planned: 28, done: 31, color: "#C2D2E9" },
  { id: "may", month: "May", planned: 35, done: 27, color: "#394E79" },
  { id: "jun", month: "Jun", planned: 32, done: 36, color: "#9A8BA5" }
]

/** A config with axes: the months below, the numbers at the left, and one series for each number. */
const withAxes = (type: ChartType): ChartConfig => ({
  type,
  scales: { bottom: { text: "month" }, left: { maxTicks: 8, min: 0, max: 40 } },
  series: [
    { id: "planned", value: "planned", color: "#81C4E8", fill: "#81C4E8", strokeWidth: 2 },
    { id: "done", value: "done", color: "#394E79", fill: "#394E79", strokeWidth: 2 }
  ],
  legend: { series: ["planned", "done"], halign: "right", valign: "top" }
})

/** A config with slices: one slice for each row. */
const withSlices = (type: ChartType): ChartConfig => ({
  type,
  series: [{ value: "done", color: "color", text: "month" }],
  legend: { values: { text: "month", color: "color" }, halign: "right", valign: "top" }
})

/** Buttons that change the store. The chart only follows it. */
const controls = (rows: SubscriptionRef.SubscriptionRef<ReadonlyArray<Month>>) =>
  Effect.gen(function* () {
    const bar = yield* element("div", "dhxe-row")
    const more = yield* inside(bar, button({ label: "More done in the last month" }))
    const drop = yield* inside(bar, button({ label: "Remove the first month", color: "secondary" }))
    yield* more.clicks.pipe(
      Stream.runForEach(() => SubscriptionRef.update(rows, (all) => all.map((one, index) => (index === all.length - 1 ? { ...one, done: Math.min(40, one.done + 3) } : one)))),
      Effect.forkScoped
    )
    yield* drop.clicks.pipe(Stream.runForEach(() => SubscriptionRef.update(rows, (all) => all.slice(1))), Effect.forkScoped)
  })

/** A button for each type: it sets the config, and the chart changes in place. */
const typeButtons = (config: SubscriptionRef.SubscriptionRef<ChartConfig>, types: ReadonlyArray<ChartType>, make: (type: ChartType) => ChartConfig) =>
  Effect.gen(function* () {
    const bar = yield* element("div", "dhxe-row")
    for (const type of types) {
      const one = yield* inside(bar, button({ label: type, color: "secondary", view: "link" }))
      yield* one.clicks.pipe(Stream.runForEach(() => SubscriptionRef.set(config, make(type))), Effect.forkScoped)
    }
  })

export const WithAxes: Story = {
  name: "Bar, line and area",
  render: () =>
    widgetStory(Effect.gen(function* () {
      const rows = yield* SubscriptionRef.make(months())
      const data = yield* dataCollection(rows)
      const config = yield* SubscriptionRef.make(withAxes("bar"))
      const [, , log, made] = yield* column([
        controls(rows),
        typeButtons(config, ["bar", "xbar", "line", "spline", "area", "splineArea", "scatter"], withAxes),
        element("pre", "dhxe-log", "Click a bar or a point. Click a name in the legend to hide its series."),
        chart({ data, config })
      ])
      yield* made.clicks.pipe(Stream.runForEach(({ series, row }) => Effect.sync(() => (log.textContent = `clicked ${series} of ${row}`))), Effect.forkScoped)
      yield* made.toggled.pipe(Stream.runForEach((series) => Effect.sync(() => (log.textContent = `toggled ${series}`))), Effect.forkScoped)
    }))
}

export const WithSlices: Story = {
  name: "Pie and donut",
  render: () =>
    widgetStory(Effect.gen(function* () {
      const rows = yield* SubscriptionRef.make(months())
      const data = yield* dataCollection(rows)
      const config = yield* SubscriptionRef.make(withSlices("pie"))
      yield* column([controls(rows), typeButtons(config, ["pie", "pie3D", "donut"], withSlices), chart({ data, config })])
    }))
}

export const Radar: Story = {
  render: () =>
    widgetStory(Effect.gen(function* () {
      const rows = yield* SubscriptionRef.make(months())
      const data = yield* dataCollection(rows)
      yield* column([
        controls(rows),
        chart({
          data,
          config: {
            type: "radar",
            scales: { radial: { value: "month", maxTicks: 8 } },
            series: [
              { id: "planned", value: "planned", color: "#81C4E8", fill: "#81C4E8", alpha: 0.3 },
              { id: "done", value: "done", color: "#394E79", fill: "#394E79", alpha: 0.3 }
            ],
            legend: { series: ["planned", "done"], halign: "right", valign: "top" }
          }
        })
      ])
    }))
}

export const OneStoreChartAndGrid: Story = {
  name: "One store, Chart and Grid",
  render: () =>
    widgetStory(Effect.gen(function* () {
      const rows = yield* SubscriptionRef.make(months())
      const data = yield* dataCollection(rows)
      yield* column([
        controls(rows),
        layout({
          direction: "cols",
          cells: [
            { id: "chart", part: chart({ data, config: withAxes("bar") }) },
            { id: "grid", width: 360, part: grid({ data, columns: [{ id: "month", header: "Month" }, { id: "planned", header: "Planned", align: "right" }, { id: "done", header: "Done", align: "right" }] }) }
          ]
        })
      ])
    }))
}
