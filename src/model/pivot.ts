import { Effect, Schema, type Scope, type Stream, SubscriptionRef } from "effect"
import { changesOf, type Entry, history, type Input, input, recordInput } from "./model"

/**
 * The model of a Pivot: the rows as data, and the build of the table as state. A change in the
 * panel of the Pivot is the action `configure`.
 */

/** One field of the rows: its id is the key in a row. */
export type PivotField = { readonly id: string; readonly label?: string; readonly type: "number" | "text" | "date" }

/** A value of the table: a field and how it is summed up, such as `sum`, `count`, `min`, `max` or `average`. */
export type PivotValue = { readonly field: string; readonly method: string }

/** How the table is built: the fields of the rows, the fields of the columns, and the values in the cells. */
export type PivotConfig = {
  readonly rows?: ReadonlyArray<string>
  readonly columns?: ReadonlyArray<string>
  readonly values?: ReadonlyArray<PivotValue>
  readonly filters?: Readonly<Record<string, unknown>>
}

export const PivotFieldSchema = Schema.Struct({ id: Schema.String, label: Schema.optionalKey(Schema.String), type: Schema.Literals(["number", "text", "date"]) })
export const PivotConfigSchema = Schema.Struct({
  rows: Schema.optional(Schema.Array(Schema.String)),
  columns: Schema.optional(Schema.Array(Schema.String)),
  values: Schema.optional(Schema.Array(Schema.Struct({ field: Schema.String, method: Schema.String }))),
  filters: Schema.optional(Schema.Record(Schema.String, Schema.Unknown))
})

type Row = Readonly<Record<string, unknown>>

export type PivotModel = {
  readonly rows: SubscriptionRef.SubscriptionRef<ReadonlyArray<Row>>
  readonly config: SubscriptionRef.SubscriptionRef<PivotConfig>
  /** A new build of the table. A field that is not one of the fields is refused. */
  readonly configure: (config: PivotConfig) => Effect.Effect<boolean>
  readonly recent: Effect.Effect<ReadonlyArray<Entry>>
  readonly snapshot: Effect.Effect<{ readonly rows: ReadonlyArray<Row>; readonly config: PivotConfig }>
  readonly changes: Stream.Stream<void>
}

/** The actions of a `PivotModel`, by name. */
export const PIVOT_ACTIONS = ["configure"] as const satisfies ReadonlyArray<keyof PivotModel>

export const pivotModel = (
  fields: ReadonlyArray<PivotField>,
  options: { readonly rows: Input<ReadonlyArray<Row>>; readonly config?: Input<PivotConfig>; readonly history?: number }
): Effect.Effect<PivotModel, never, Scope.Scope> =>
  Effect.gen(function* () {
    const rows = yield* input<ReadonlyArray<Row>>(options.rows, [])
    const config = yield* input<PivotConfig>(options.config, {})
    const log = yield* history(options.history ?? 0)
    yield* recordInput(log, "rows", rows)
    yield* recordInput(log, "config", config)
    const ids = new Set(fields.map((field) => field.id))
    return {
      rows,
      config,
      configure: (next) =>
        Effect.gen(function* () {
          const used = [...(next.rows ?? []), ...(next.columns ?? []), ...(next.values ?? []).map((value) => value.field)]
          if (!used.every((id) => ids.has(id))) return false
          yield* log.record({ _tag: "action", name: "configure", value: next })
          yield* SubscriptionRef.set(config, next)
          return true
        }),
      recent: log.recent,
      snapshot: Effect.gen(function* () {
        return { rows: yield* SubscriptionRef.get(rows), config: yield* SubscriptionRef.get(config) }
      }),
      changes: changesOf(rows, config)
    }
  })
