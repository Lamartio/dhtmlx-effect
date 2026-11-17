import { Effect, PubSub, Schema, type Scope, Stream, SubscriptionRef } from "effect"
import type { Row } from "../core/rows"
import { changesOf, type Entry, history, type Input, input, recordInput } from "./model"

/**
 * The model of a Chart: the rows as data, and the series that the user hid with a click on the
 * legend as state. A click on a point is an action, which goes out in `clicked`.
 */

/** The config of a Chart as data, as DHTMLX takes it: its type, its series, and its scales and legend. */
export const ChartConfigSchema = Schema.Struct({
  type: Schema.String,
  series: Schema.Array(Schema.Record(Schema.String, Schema.Unknown)),
  scales: Schema.optional(Schema.Record(Schema.String, Schema.Unknown)),
  legend: Schema.optional(Schema.Record(Schema.String, Schema.Unknown))
})

export type ChartModel = {
  readonly rows: SubscriptionRef.SubscriptionRef<ReadonlyArray<Row>>
  /** The ids of the series that are hidden. */
  readonly hidden: SubscriptionRef.SubscriptionRef<ReadonlyArray<string>>
  /** Each click on a point: its series and its row. */
  readonly clicked: Stream.Stream<{ readonly series: string; readonly row: string }>
  /** Hides a series, or shows it again. A series that is not there is refused. */
  readonly toggle: (series: string) => Effect.Effect<boolean>
  /** A click on a point. A series or a row that is not there is refused. */
  readonly click: (series: string, row: string) => Effect.Effect<boolean>
  readonly recent: Effect.Effect<ReadonlyArray<Entry>>
  readonly snapshot: Effect.Effect<{ readonly rows: ReadonlyArray<Row>; readonly hidden: ReadonlyArray<string> }>
  readonly changes: Stream.Stream<void>
}

/** The actions of a `ChartModel`, by name. */
export const CHART_ACTIONS = ["toggle", "click"] as const satisfies ReadonlyArray<keyof ChartModel>

/** The model of a Chart with the series `series` (their ids). */
export const chartModel = (
  series: ReadonlyArray<string>,
  options: { readonly rows: Input<ReadonlyArray<Row>>; readonly hidden?: Input<ReadonlyArray<string>>; readonly history?: number }
): Effect.Effect<ChartModel, never, Scope.Scope> =>
  Effect.gen(function* () {
    const rows = yield* input<ReadonlyArray<Row>>(options.rows, [])
    const hidden = yield* input<ReadonlyArray<string>>(options.hidden, [])
    const clicked = yield* Effect.acquireRelease(PubSub.unbounded<{ readonly series: string; readonly row: string }>(), PubSub.shutdown)
    const log = yield* history(options.history ?? 0)
    yield* recordInput(log, "hidden", hidden)
    return {
      rows,
      hidden,
      clicked: Stream.fromPubSub(clicked),
      toggle: (id) =>
        Effect.gen(function* () {
          if (!series.includes(id)) return false
          yield* log.record({ _tag: "action", name: "toggle", value: id })
          const now = yield* SubscriptionRef.get(hidden)
          yield* SubscriptionRef.set(hidden, now.includes(id) ? now.filter((one) => one !== id) : [...now, id])
          return true
        }),
      click: (id, row) =>
        Effect.gen(function* () {
          if (!series.includes(id) || !(yield* SubscriptionRef.get(rows)).some((one) => one.id === row)) return false
          yield* log.record({ _tag: "action", name: "click", value: { series: id, row } })
          yield* PubSub.publish(clicked, { series: id, row })
          yield* log.record({ _tag: "event", name: "clicked", value: { series: id, row } })
          return true
        }),
      recent: log.recent,
      snapshot: Effect.all({ rows: SubscriptionRef.get(rows), hidden: SubscriptionRef.get(hidden) }),
      changes: changesOf(rows, hidden)
    }
  })

/** The ids of the series of a config: the `id` of each series, or its `value` field. */
export const seriesIds = (config: { readonly series: ReadonlyArray<Readonly<Record<string, unknown>>> }) =>
  config.series.map((one) => String(one["id"] ?? one["value"]))
