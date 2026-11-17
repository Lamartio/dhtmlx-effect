import { Effect, PubSub, Schema, type Scope, Stream, SubscriptionRef } from "effect"
import { changesOf, type Entry, history, type Input, input, recordInput } from "./model"

/**
 * The model of a Diagram and its editor: the items (shapes, lines, groups) as data, the selected
 * item as state. A click on a shape is an action that goes out in `clicked`; a change in the editor
 * is the action `edit` with all the items, as the editor gives them.
 */

/** An item of a diagram as data: a shape, a line, a group or a swimlane, with an id. */
export const DiagramItemSchema = Schema.Record(Schema.String, Schema.Unknown).pipe(
  Schema.check(Schema.makeFilter((item: Readonly<Record<string, unknown>>) => typeof item["id"] === "string" || "An item of a diagram needs an id that is a string"))
)
export type Item = Readonly<Record<string, unknown>> & { readonly id: string }

export type DiagramModel = {
  readonly items: SubscriptionRef.SubscriptionRef<ReadonlyArray<Item>>
  readonly selected: SubscriptionRef.SubscriptionRef<string | undefined>
  /** Each shape that the user clicked. */
  readonly clicked: Stream.Stream<string>
  /** Chooses an item, or none. An item that is not there is refused. */
  readonly select: (id: string | undefined) => Effect.Effect<boolean>
  /** A click on a shape. A shape that is not there is refused. */
  readonly click: (id: string) => Effect.Effect<boolean>
  /** The items after a change in the editor. A line from or to an item that is not there is refused, as is an item with no id. */
  readonly edit: (items: ReadonlyArray<Item>) => Effect.Effect<boolean>
  readonly recent: Effect.Effect<ReadonlyArray<Entry>>
  readonly snapshot: Effect.Effect<{ readonly items: ReadonlyArray<Item>; readonly selected?: string }>
  readonly changes: Stream.Stream<void>
}

/** The actions of a `DiagramModel`, by name. */
export const DIAGRAM_ACTIONS = ["select", "click", "edit"] as const satisfies ReadonlyArray<keyof DiagramModel>

/** True when each item has an id, and each line goes from and to an item that is there. */
export const wellLinked = (items: ReadonlyArray<Readonly<Record<string, unknown>>>) => {
  if (!items.every((item) => typeof item["id"] === "string")) return false
  const ids = new Set(items.map((item) => item["id"]))
  return items.every((item) => (item["from"] === undefined || ids.has(item["from"])) && (item["to"] === undefined || ids.has(item["to"])))
}

export const diagramModel = (options: { readonly items: Input<ReadonlyArray<Item>>; readonly selected?: Input<string | undefined>; readonly history?: number }): Effect.Effect<DiagramModel, never, Scope.Scope> =>
  Effect.gen(function* () {
    const items = yield* input<ReadonlyArray<Item>>(options.items, [])
    const selected = yield* input(options.selected, undefined)
    const clicked = yield* Effect.acquireRelease(PubSub.unbounded<string>(), PubSub.shutdown)
    const log = yield* history(options.history ?? 0)
    yield* recordInput(log, "items", items)
    yield* recordInput(log, "selected", selected)
    const has = (id: string) => Effect.map(SubscriptionRef.get(items), (all) => all.some((item) => item.id === id))
    return {
      items,
      selected,
      clicked: Stream.fromPubSub(clicked),
      select: (id) =>
        Effect.gen(function* () {
          if (id !== undefined && !(yield* has(id))) return false
          yield* log.record({ _tag: "action", name: "select", value: id })
          if ((yield* SubscriptionRef.get(selected)) !== id) yield* SubscriptionRef.set(selected, id)
          return true
        }),
      click: (id) =>
        Effect.gen(function* () {
          if (!(yield* has(id))) return false
          yield* log.record({ _tag: "action", name: "click", value: id })
          yield* PubSub.publish(clicked, id)
          yield* log.record({ _tag: "event", name: "clicked", value: id })
          return true
        }),
      edit: (next) =>
        Effect.gen(function* () {
          if (!wellLinked(next)) return false
          yield* log.record({ _tag: "action", name: "edit", value: next })
          yield* SubscriptionRef.set(items, next)
          return true
        }),
      recent: log.recent,
      snapshot: Effect.gen(function* () {
        const now = yield* SubscriptionRef.get(selected)
        return { items: yield* SubscriptionRef.get(items), ...(now === undefined ? {} : { selected: now }) }
      }),
      changes: changesOf(items, selected)
    }
  })
