import { Chart, type DataCollection, setTheme } from "dhx-suite"
import type { ILegendConfig, IScalesConfig, SeriaConfig, TChartType } from "dhx-suite/codebase/types/ts-chart/sources/types"
import { Effect, PubSub, Scope, Stream, SubscriptionRef } from "effect"
import { Browser, follow } from "./browser"
import { Host, resource } from "./host"
import { reportedCallback } from "./problems"

/** The 13 types of the Chart. */
export type ChartType = TChartType

/** What the Chart draws: its type, its series, and the scales and the legend around them, as DHTMLX takes them. */
export type ChartConfig = {
  readonly type: ChartType
  /** One or more series: which field of a row is the value, and how it looks. */
  readonly series: ReadonlyArray<SeriaConfig>
  /** The axes. A pie, a donut and a treemap have none. */
  readonly scales?: IScalesConfig
  readonly legend?: ILegendConfig
}

export type ChartOptions = {
  /** The rows, from `dataCollection`: one collection can drive a Chart and a Grid. */
  readonly data: DataCollection
  /** Fixed, or in a `SubscriptionRef`: a new config changes the chart in place, for example to another type. */
  readonly config: ChartConfig | SubscriptionRef.SubscriptionRef<ChartConfig>
}

/** A click on a point, a bar or a slice: the id of its series, and the id of its row. */
export type ChartClick = { readonly series: string; readonly row: string }

const configOf = (config: ChartConfig) => ({
  type: config.type,
  series: [...config.series],
  ...(config.scales === undefined ? {} : { scales: config.scales }),
  ...(config.legend === undefined ? {} : { legend: config.legend })
})

/**
 * A DHTMLX Chart on a collection. The rows come from the store through `dataCollection`, so a change
 * of a row moves its point, and the chart is not made again. Gives the clicks on the points as a
 * stream, and `toggled`: the id of each series that a click on the legend shows or hides. The theme
 * follows `Browser.dark`.
 */
export const chart = (options: ChartOptions) =>
  Effect.gen(function* () {
    const host = yield* Host
    const browser = yield* Browser
    const ref = SubscriptionRef.isSubscriptionRef(options.config) ? (options.config as SubscriptionRef.SubscriptionRef<ChartConfig>) : undefined
    const first = ref === undefined ? (options.config as ChartConfig) : yield* SubscriptionRef.get(ref)
    const clicks = yield* Effect.acquireRelease(PubSub.unbounded<ChartClick>(), PubSub.shutdown)
    const toggled = yield* Effect.acquireRelease(PubSub.unbounded<string>(), PubSub.shutdown)
    const view = yield* resource(
      "chart",
      () => new Chart(host, { ...configOf(first), data: options.data as never, css: "dhxe-chart" }),
      (view) => view.destructor()
    )
    const onClick = yield* reportedCallback("The Chart, on a click", (series: string, row: string) => {
      Effect.runSync(PubSub.publish(clicks, { series: String(series), row: String(row) }))
    })
    const onToggle = yield* reportedCallback("The Chart, on a click on the legend", (series: string) => {
      Effect.runSync(PubSub.publish(toggled, String(series)))
    })
    yield* resource(
      "listener",
      () => {
        view.events.on("serieClick" as never, onClick as never)
        view.events.on("toggleSeries" as never, onToggle as never)
      },
      () => {
        view.events.detach("serieClick" as never)
        view.events.detach("toggleSeries" as never)
      }
    )
    yield* follow(browser.dark, (dark) => setTheme(dark ? "dark" : "light", host))
    if (ref !== undefined) {
      // The first value made the chart. Each one after it changes the chart in place.
      let shown: ChartConfig = first
      yield* follow(ref, (config) => {
        if (config === shown) return
        shown = config
        view.setConfig({ ...configOf(config), data: options.data as never, css: "dhxe-chart" })
      }, "The Chart, while it followed its config")
    }
    return { chart: view, clicks: Stream.fromPubSub(clicks), toggled: Stream.fromPubSub(toggled) }
  }) as Effect.Effect<
    { readonly chart: Chart; readonly clicks: Stream.Stream<ChartClick>; readonly toggled: Stream.Stream<string> },
    never,
    Host | Browser | Scope.Scope
  >
