import { Effect, type Scope, Stream, SubscriptionRef } from "effect"
import type { Row } from "../core/rows"
import { changesOf, type Entry, history, type Input, input, recordInput } from "./model"

/**
 * The selection that the Grid, the List, the DataView and the Tree share: the id of the chosen row,
 * or none. A model that has the rows refuses a row that is not there. A model with no rows does not
 * check: its renderer has the rows in a DHTMLX collection, and checks them there.
 */

/** The action `select` on `selected`, for a model with this history and these rows. */
export const selectOn = (
  log: { readonly record: (entry: Entry) => Effect.Effect<void> },
  rows: SubscriptionRef.SubscriptionRef<ReadonlyArray<Row>> | undefined,
  selected: SubscriptionRef.SubscriptionRef<string | undefined>
) =>
  (id: string | undefined): Effect.Effect<void> =>
    Effect.gen(function* () {
      if (id !== undefined && rows !== undefined && !(yield* SubscriptionRef.get(rows)).some((row) => row.id === id)) return
      yield* log.record({ _tag: "action", name: "select", value: id })
      if ((yield* SubscriptionRef.get(selected)) !== id) yield* SubscriptionRef.set(selected, id)
    })

export type SelectionState = {
  readonly selected: string | undefined
  /** The rows, when the model has them: a renderer in another frame draws them. */
  readonly rows?: ReadonlyArray<Row>
}

export type SelectionModel = {
  readonly selected: SubscriptionRef.SubscriptionRef<string | undefined>
  /** Chooses a row, or none. A row that is not in the rows changes nothing. */
  readonly select: (id: string | undefined) => Effect.Effect<void>
  readonly recent: Effect.Effect<ReadonlyArray<Entry>>
  readonly snapshot: Effect.Effect<SelectionState>
  /** One `void` on each change of the state: see `changesOf`. */
  readonly changes: Stream.Stream<void>
}

/** The actions of a `SelectionModel`, by name. */
export const SELECTION_ACTIONS = ["select"] as const satisfies ReadonlyArray<keyof SelectionModel>

export type SelectionOptions = {
  /** The rows. With none, the model does not check that a row is there. */
  readonly rows?: Input<ReadonlyArray<Row>>
  readonly selected?: Input<string | undefined>
  /** How many entries `recent` keeps. Default: 0. */
  readonly history?: number
}

const parts = (options: SelectionOptions) =>
  Effect.gen(function* () {
    const rows = options.rows === undefined ? undefined : yield* input<ReadonlyArray<Row>>(options.rows, [])
    const selected = yield* input(options.selected, undefined)
    const log = yield* history(options.history ?? 0)
    yield* recordInput(log, "selected", selected)
    const ids = rows === undefined ? Effect.succeed(undefined) : SubscriptionRef.get(rows)
    const changes = rows === undefined ? changesOf(selected) : changesOf(selected, rows)
    return { rows, selected, log, ids, changes }
  })

/** The model of a List or a DataView: only the selected row. */
export const selectionModel = (options: SelectionOptions = {}): Effect.Effect<SelectionModel, never, Scope.Scope> =>
  Effect.gen(function* () {
    const { rows, selected, log, ids, changes } = yield* parts(options)
    return {
      changes,
      selected,
      select: selectOn(log, rows, selected),
      recent: log.recent,
      snapshot: Effect.gen(function* () {
        const all = yield* ids
        const now = yield* SubscriptionRef.get(selected)
        return all === undefined ? { selected: now } : { selected: now, rows: all }
      })
    }
  })

export type TreeState = SelectionState & { readonly expanded: ReadonlyArray<string> }

export type TreeModel = Omit<SelectionModel, "snapshot"> & {
  /** The ids of the open folders. */
  readonly expanded: SubscriptionRef.SubscriptionRef<ReadonlyArray<string>>
  /** Opens a folder. A row with no children, or that is not there, changes nothing. */
  readonly expand: (id: string) => Effect.Effect<void>
  readonly collapse: (id: string) => Effect.Effect<void>
  readonly snapshot: Effect.Effect<TreeState>
  /** One `void` on each change of the state: see `changesOf`. */
  readonly changes: Stream.Stream<void>
}

/** The actions of a `TreeModel`, by name. */
export const TREE_ACTIONS = ["select", "expand", "collapse"] as const satisfies ReadonlyArray<keyof TreeModel>

/** The model of a Tree: the selected row and the open folders. A row goes under the row of its `parent`. */
export const treeModel = (options: SelectionOptions & { readonly expanded?: Input<ReadonlyArray<string>> } = {}): Effect.Effect<TreeModel, never, Scope.Scope> =>
  Effect.gen(function* () {
    const { rows, selected, log, ids, changes } = yield* parts(options)
    const expanded = yield* input<ReadonlyArray<string>>(options.expanded, [])
    yield* recordInput(log, "expanded", expanded)
    const isFolder = (id: string) =>
      rows === undefined ? Effect.succeed(true) : Effect.map(SubscriptionRef.get(rows), (all) => all.some((row) => row.parent === id))
    const open = (name: "expand" | "collapse", id: string) =>
      Effect.gen(function* () {
        if (name === "expand" && !(yield* isFolder(id))) return
        yield* log.record({ _tag: "action", name, value: id })
        const now = yield* SubscriptionRef.get(expanded)
        if (now.includes(id) === (name === "expand")) return
        yield* SubscriptionRef.set(expanded, name === "expand" ? [...now, id] : now.filter((one) => one !== id))
      })
    return {
      changes: Stream.merge(changes, changesOf(expanded)),
      selected,
      expanded,
      select: selectOn(log, rows, selected),
      expand: (id) => open("expand", id),
      collapse: (id) => open("collapse", id),
      recent: log.recent,
      snapshot: Effect.gen(function* () {
        const all = yield* ids
        const state = { selected: yield* SubscriptionRef.get(selected), expanded: yield* SubscriptionRef.get(expanded) }
        return all === undefined ? state : { ...state, rows: all }
      })
    }
  })
