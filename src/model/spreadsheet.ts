import { Effect, Schema, type Scope, type Stream, SubscriptionRef } from "effect"
import { changesOf, type Entry, history, type Input, input, recordInput } from "./model"

/**
 * The model of a Spreadsheet: the cells as data. The Spreadsheet gives all the cells after each
 * action of the user: that is the action `edit`. A formula stays as the user typed it.
 */

/** One cell: its name, such as `B2`, and its value. A value that starts with `=` is a formula. */
export type SpreadsheetCell = { readonly cell: string; readonly value?: string | number; readonly css?: string; readonly format?: string; readonly [key: string]: unknown }

/** The cells of one sheet, or what DHTMLX gives when it has styles or more sheets. */
export type SpreadsheetData =
  | ReadonlyArray<SpreadsheetCell>
  | { readonly data?: ReadonlyArray<SpreadsheetCell>; readonly styles?: Readonly<Record<string, unknown>>; readonly sheets?: ReadonlyArray<unknown>; readonly [key: string]: unknown }

const CellSchema = Schema.Record(Schema.String, Schema.Unknown).pipe(
  Schema.check(Schema.makeFilter((cell: Readonly<Record<string, unknown>>) => typeof cell["cell"] === "string" || "A cell needs a name, such as B2"))
)
export const SpreadsheetDataSchema = Schema.Union([Schema.Array(CellSchema), Schema.Record(Schema.String, Schema.Unknown)]) as unknown as Schema.Codec<SpreadsheetData>

type Sheet = { readonly data?: ReadonlyArray<SpreadsheetCell> }

/** The cells of all the sheets. */
export const cellsOf = (data: SpreadsheetData): ReadonlyArray<SpreadsheetCell> => {
  if (Array.isArray(data)) return data
  const one = data as Sheet & { readonly sheets?: ReadonlyArray<Sheet> }
  return [...(one.data ?? []), ...(one.sheets ?? []).flatMap((sheet) => sheet.data ?? [])]
}

export type SpreadsheetModel = {
  readonly data: SubscriptionRef.SubscriptionRef<SpreadsheetData>
  /** The cells after an action of the user. A cell with no name is refused. */
  readonly edit: (data: SpreadsheetData) => Effect.Effect<boolean>
  readonly recent: Effect.Effect<ReadonlyArray<Entry>>
  readonly snapshot: Effect.Effect<{ readonly data: SpreadsheetData }>
  readonly changes: Stream.Stream<void>
}

/** The actions of a `SpreadsheetModel`, by name. */
export const SPREADSHEET_ACTIONS = ["edit"] as const satisfies ReadonlyArray<keyof SpreadsheetModel>

export const spreadsheetModel = (options: { readonly data: Input<SpreadsheetData>; readonly history?: number }): Effect.Effect<SpreadsheetModel, never, Scope.Scope> =>
  Effect.gen(function* () {
    const data = yield* input<SpreadsheetData>(options.data, [])
    const log = yield* history(options.history ?? 0)
    yield* recordInput(log, "data", data)
    return {
      data,
      edit: (next) =>
        Effect.gen(function* () {
          if (!cellsOf(next).every((cell) => typeof cell.cell === "string")) return false
          yield* log.record({ _tag: "action", name: "edit", value: next })
          yield* SubscriptionRef.set(data, next)
          return true
        }),
      recent: log.recent,
      snapshot: Effect.map(SubscriptionRef.get(data), (now) => ({ data: now })),
      changes: changesOf(data)
    }
  })
