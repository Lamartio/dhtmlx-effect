import { Effect, PubSub, type Scope, Stream, SubscriptionRef } from "effect"
import type { Row } from "../core/rows"
import { changesOf, type Entry, history, type Input, input, recordInput } from "./model"

export type KanbanColumn = {
  readonly id: string
  readonly label: string
  /** The most cards in the column. The header shows the count against it, and the column marks when it has more. */
  readonly limit?: number
  /** With a limit: a move into a full column is refused. */
  readonly strictLimit?: boolean
  /** The column starts folded. */
  readonly collapsed?: boolean
}

/** A swimlane: a row across all the columns. */
export type KanbanLane = { readonly id: string; readonly label: string; readonly collapsed?: boolean }

export type KanbanState<R extends Row> = {
  readonly selected: string | undefined
  /** The rows: a renderer in another frame draws them. */
  readonly rows: ReadonlyArray<R>
}

export type KanbanModel<R extends Row> = {
  readonly rows: SubscriptionRef.SubscriptionRef<ReadonlyArray<R>>
  readonly selected: SubscriptionRef.SubscriptionRef<string | undefined>
  /** The id of each card that the user opens. */
  readonly opened: Stream.Stream<string>
  /**
   * Moves a card to a column, and to a lane when there are lanes: it sets `field` (and the field of
   * the lane) of the row. A row, a column or a lane that is not there, or a full column with
   * `strictLimit`, changes nothing.
   */
  readonly move: (id: string, column: string, lane?: string) => Effect.Effect<boolean>
  /** Chooses a card, or none. A card that is not there changes nothing. */
  readonly select: (id: string | undefined) => Effect.Effect<boolean>
  /** Opens a card: it goes out in `opened`. A card that is not there changes nothing. */
  readonly open: (id: string) => Effect.Effect<boolean>
  readonly recent: Effect.Effect<ReadonlyArray<Entry>>
  readonly snapshot: Effect.Effect<KanbanState<R>>
  /** One `void` on each change of the state: see `changesOf`. */
  readonly changes: Stream.Stream<void>
}

/** The actions of a `KanbanModel`, by name. */
export const KANBAN_ACTIONS = ["move", "select", "open"] as const satisfies ReadonlyArray<keyof KanbanModel<Row>>

export type KanbanModelOptions<R extends Row> = {
  /** The rows, such as the issues of a tracker. Each one is a card. */
  readonly rows: Input<ReadonlyArray<R>>
  /** The field of a row that says its column, such as `status`. */
  readonly field: keyof R & string
  readonly columns: ReadonlyArray<KanbanColumn>
  /** Swimlanes: the field of a row that says its lane, such as `team`. */
  readonly lanes?: { readonly field: keyof R & string; readonly rows: ReadonlyArray<KanbanLane> }
  readonly selected?: Input<string | undefined>
  /** How many entries `recent` keeps. Default: 0. */
  readonly history?: number
}

/** The model of a Kanban: the rows as input, a move and the chosen card as actions, with the limits of a column as a rule. */
export const kanbanModel = <R extends Row>(options: KanbanModelOptions<R>): Effect.Effect<KanbanModel<R>, never, Scope.Scope> =>
  Effect.gen(function* () {
    const rows = yield* input<ReadonlyArray<R>>(options.rows, [])
    const selected = yield* input(options.selected, undefined)
    const opened = yield* Effect.acquireRelease(PubSub.unbounded<string>(), PubSub.shutdown)
    const log = yield* history(options.history ?? 0)
    yield* recordInput(log, "rows", rows)
    yield* recordInput(log, "selected", selected)
    const action = (name: string, value: unknown) => log.record({ _tag: "action", name, value })
    const lane = options.lanes?.field
    const find = (id: string) => Effect.map(SubscriptionRef.get(rows), (all) => all.find((row) => row.id === id))
    return {
      rows,
      selected,
      opened: Stream.fromPubSub(opened),
      move: (id, column, to) =>
        Effect.gen(function* () {
          const all = yield* SubscriptionRef.get(rows)
          const row = all.find((one) => one.id === id)
          const target = options.columns.find((one) => one.id === column)
          if (row === undefined || target === undefined) return false
          if (lane !== undefined && to !== undefined && !options.lanes!.rows.some((one) => one.id === to)) return false
          const moved = { [options.field]: column, ...(lane === undefined || to === undefined ? {} : { [lane]: to }) }
          if (Object.entries(moved).every(([key, value]) => String(row[key as keyof R]) === value)) return true
          const inColumn = all.filter((one) => one.id !== id && String(one[options.field]) === column).length
          if (target.strictLimit === true && target.limit !== undefined && String(row[options.field]) !== column && inColumn >= target.limit) return false
          yield* action("move", { id, column, ...(to === undefined ? {} : { lane: to }) })
          yield* SubscriptionRef.set(rows, all.map((one) => (one.id === id ? { ...one, ...moved } : one)))
          return true
        }),
      select: (id) =>
        Effect.gen(function* () {
          if (id !== undefined && (yield* find(id)) === undefined) return false
          yield* action("select", id)
          if ((yield* SubscriptionRef.get(selected)) !== id) yield* SubscriptionRef.set(selected, id)
          return true
        }),
      open: (id) =>
        Effect.gen(function* () {
          if ((yield* find(id)) === undefined) return false
          yield* action("open", id)
          yield* PubSub.publish(opened, id)
          yield* log.record({ _tag: "event", name: "opened", value: id })
          return true
        }),
      recent: log.recent,
      snapshot: Effect.all({ selected: SubscriptionRef.get(selected), rows: SubscriptionRef.get(rows) }),
      changes: changesOf(selected, rows)
    }
  })
