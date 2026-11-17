import { Effect, PubSub, type Scope, Stream, SubscriptionRef } from "effect"
import type { Row } from "../core/rows"
import { clickable, type MenuItem } from "./clicks"
import { changesOf, type Entry, history, type Input, input, recordInput } from "./model"
import { selectOn } from "./selection"

export type GridColumn = {
  readonly id: string
  readonly header: string
  readonly width?: number
  /** Sorts on a click on the header. Default: true. */
  readonly sortable?: boolean
  readonly align?: "left" | "center" | "right"
  /** What the values are. A `number` sorts as a number, and a `boolean` shows a checkbox. Default: `string`. */
  readonly type?: "string" | "number" | "boolean" | "date"
  /** The user can change the cells of this column: a double click opens the editor. Default: false. */
  readonly editable?: boolean
  /** The editor of a cell. Default: an input, or a checkbox for a `boolean`. */
  readonly editor?: "input" | "select" | "combobox" | "checkbox" | "datePicker" | "textarea"
  /** The choices of a `select` or a `combobox` editor, and of a `select` or `combo` filter that should not read them from the rows. */
  readonly options?: ReadonlyArray<string>
  /** A filter in the header, under the name of the column: a text input, or a list of the values. */
  readonly filter?: "input" | "select" | "combo"
  /** The user can drag the edge of the header to change the width. Default: false. */
  readonly resizable?: boolean
}

/** A cell that the user changed: the id of the row, the id of the column, and the new value. */
export type GridEdit = { readonly row: string; readonly column: string; readonly value: unknown }

export type GridSort = { readonly column: string; readonly dir: "asc" | "desc" }

/** The state of a Grid, as intent: DHTMLX sorts and filters the rows. */
export type GridState = {
  readonly selected: string | undefined
  readonly sort: GridSort | undefined
  /** The text of each header filter that has one. */
  readonly filters: Readonly<Record<string, string>>
  /** The rows, when the model has them: a renderer in another frame draws them. */
  readonly rows?: ReadonlyArray<{ readonly id: string }>
}

export type GridModel = {
  readonly selected: SubscriptionRef.SubscriptionRef<string | undefined>
  readonly sort: SubscriptionRef.SubscriptionRef<GridSort | undefined>
  readonly filters: SubscriptionRef.SubscriptionRef<Readonly<Record<string, string>>>
  /** Each cell that the user changed. The store is the truth: the app writes the new value into the rows. */
  readonly edits: Stream.Stream<GridEdit>
  /** Chooses a row, or none. A row that is not in the rows changes nothing. */
  readonly select: (id: string | undefined) => Effect.Effect<boolean>
  /** Sorts on a column. With no `dir` a second sort on the same column turns the order around. A column that is not sortable changes nothing. */
  readonly sortBy: (column: string, dir?: "asc" | "desc") => Effect.Effect<boolean>
  /** The text of the filter of a column; an empty text clears it. A column with no filter changes nothing. */
  readonly filter: (column: string, text: string) => Effect.Effect<boolean>
  /** Changes a cell. A column that is not editable, or a row that is not there, changes nothing. */
  readonly edit: (row: string, column: string, value: unknown) => Effect.Effect<boolean>
  /** The context menu of a row: the user chose `item` for `row`. An item that is not in `menu`, or a row that is not there, is refused. */
  readonly choose: (row: string, item: string) => Effect.Effect<boolean>
  /** Each item of the context menu that the user chose, with its row. */
  readonly chosen: Stream.Stream<{ readonly row: string; readonly item: string }>
  readonly recent: Effect.Effect<ReadonlyArray<Entry>>
  readonly snapshot: Effect.Effect<GridState>
  /** One `void` on each change of the state: see `changesOf`. */
  readonly changes: Stream.Stream<void>
}

/** The actions of a `GridModel`, by name. */
export const GRID_ACTIONS = ["select", "sortBy", "filter", "edit", "choose"] as const satisfies ReadonlyArray<keyof GridModel>

export type GridModelOptions<R extends { readonly id: string }> = {
  readonly columns: ReadonlyArray<GridColumn>
  /** The rows. With none, the model does not check that a row is there: the renderer does. */
  readonly rows?: Input<ReadonlyArray<R>>
  readonly selected?: Input<string | undefined>
  readonly sort?: Input<GridSort | undefined>
  readonly filters?: Input<Readonly<Record<string, string>>>
  /** The context menu of a row. */
  readonly menu?: ReadonlyArray<MenuItem>
  /** How many entries `recent` keeps. Default: 0. */
  readonly history?: number
}

export const gridModel = <R extends { readonly id: string }>(options: GridModelOptions<R>): Effect.Effect<GridModel, never, Scope.Scope> =>
  Effect.gen(function* () {
    const column = (id: string) => options.columns.find((one) => one.id === id)
    const rows = options.rows === undefined ? undefined : yield* input(options.rows, [])
    const has = (id: string) =>
      rows === undefined ? Effect.succeed(true) : Effect.map(SubscriptionRef.get(rows), (all) => all.some((row) => row.id === id))
    const selected = yield* input(options.selected, undefined)
    const sort = yield* input<GridSort | undefined>(options.sort, undefined)
    const filters = yield* input<Readonly<Record<string, string>>>(options.filters, {})
    const edits = yield* Effect.acquireRelease(PubSub.unbounded<GridEdit>(), PubSub.shutdown)
    const chosen = yield* Effect.acquireRelease(PubSub.unbounded<{ readonly row: string; readonly item: string }>(), PubSub.shutdown)
    const items = clickable(options.menu ?? [])
    const log = yield* history(options.history ?? 0)
    yield* recordInput(log, "selected", selected)
    yield* recordInput(log, "sort", sort)
    yield* recordInput(log, "filters", filters)
    const action = (name: string, value: unknown) => log.record({ _tag: "action", name, value })
    return {
      selected,
      sort,
      filters,
      edits: Stream.fromPubSub(edits),
      chosen: Stream.fromPubSub(chosen),
      choose: (row, item) =>
        Effect.gen(function* () {
          if (!items.includes(item) || !(yield* has(row))) return false
          yield* action("choose", { row, item })
          yield* PubSub.publish(chosen, { row, item })
          yield* log.record({ _tag: "event", name: "chosen", value: { row, item } })
          return true
        }),
      select: selectOn(log, rows as SubscriptionRef.SubscriptionRef<ReadonlyArray<Row>> | undefined, selected),
      sortBy: (id, dir) =>
        Effect.gen(function* () {
          const col = column(id)
          if (col === undefined || col.sortable === false) return false
          const now = yield* SubscriptionRef.get(sort)
          const next: GridSort = { column: id, dir: dir ?? (now?.column === id && now.dir === "asc" ? "desc" : "asc") }
          yield* action("sortBy", next)
          if (now?.column !== next.column || now.dir !== next.dir) yield* SubscriptionRef.set(sort, next)
          return true
        }),
      filter: (id, text) =>
        Effect.gen(function* () {
          if (column(id)?.filter === undefined) return false
          yield* action("filter", { column: id, text })
          const now = yield* SubscriptionRef.get(filters)
          if ((now[id] ?? "") === text) return true
          const { [id]: _, ...rest } = now
          yield* SubscriptionRef.set(filters, text === "" ? rest : { ...rest, [id]: text })
          return true
        }),
      edit: (row, id, value) =>
        Effect.gen(function* () {
          if (column(id)?.editable !== true || !(yield* has(row))) return false
          const edit = { row, column: id, value }
          yield* action("edit", edit)
          yield* PubSub.publish(edits, edit)
          yield* log.record({ _tag: "event", name: "edits", value: edit })
          return true
        }),
      recent: log.recent,
      snapshot: Effect.gen(function* () {
        const state = { selected: yield* SubscriptionRef.get(selected), sort: yield* SubscriptionRef.get(sort), filters: yield* SubscriptionRef.get(filters) }
        return rows === undefined ? state : { ...state, rows: yield* SubscriptionRef.get(rows) }
      }),
      changes: rows === undefined ? changesOf(selected, sort, filters) : changesOf(selected, sort, filters, rows)
    } satisfies GridModel
  })
