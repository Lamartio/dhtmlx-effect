import { Effect, PubSub, Ref, type Scope, Stream, SubscriptionRef } from "effect"
import type { Row } from "../core/rows"
import { CHART_ACTIONS, type ChartModel } from "./chart"
import { CLICK_ACTIONS, type ClickModel } from "./clicks"
import { FORM_ACTIONS, type FormModel } from "./form"
import { type GanttModel, GANTT_ACTIONS, type Task, type Zoom } from "./gantt"
import { GRID_ACTIONS, type GridModel, type GridSort } from "./grid"
import { VALUE_ACTIONS, type ValueModel } from "./inputs"
import { KANBAN_ACTIONS, type KanbanModel } from "./kanban"
import { changesOf, type Entry, stableJson } from "./model"
import { type CalendarEvent, SCHEDULER_ACTIONS, type SchedulerModel, type SchedulerView } from "./scheduler"
import { SELECTION_ACTIONS, type SelectionModel, TREE_ACTIONS, type TreeModel } from "./selection"
import { type Mirror, receive, type StateMessage, type UiState } from "./ui-state"

/**
 * A plugin and a page in two frames. The plugin has the models (the truth) and sends their state as
 * patches. The page has a copy of the state, and a remote model for each widget: its refs follow the
 * copy, and its actions go to the plugin, with the id of the part. The plugin answers each one.
 */

/** An action of the user in the page, for the part `id` in the plugin. `n` counts the actions of the page. */
export type ActionMessage = { readonly _tag: "action"; readonly n: number; readonly id: string; readonly action: string; readonly args: ReadonlyArray<unknown> }
/** The page asks for the whole state again: its copy did not match. */
export type ResyncMessage = { readonly _tag: "resync" }
/** The answer of the plugin to the action `n`: did the model take it. */
export type AnswerMessage = { readonly _tag: "answer"; readonly n: number; readonly accepted: boolean }

/** From the page to the plugin. */
export type HostMessage = ActionMessage | ResyncMessage
/** From the plugin to the page. */
export type PluginMessage = StateMessage | AnswerMessage

/** One end of a channel: the messages that come in, and a way to send. `send` may run in `runSync`. */
export type Channel<In, Out> = { readonly messages: Stream.Stream<In>; readonly send: (message: Out) => Effect.Effect<void> }

/** Two ends of a channel in one process, for a test: what one sends, the other gets. */
export const memoryChannel = <A, B>() =>
  Effect.gen(function* () {
    const toA = yield* Effect.acquireRelease(PubSub.unbounded<A>(), PubSub.shutdown)
    const toB = yield* Effect.acquireRelease(PubSub.unbounded<B>(), PubSub.shutdown)
    const a: Channel<A, B> = { messages: Stream.fromPubSub(toA), send: (message) => PubSub.publish(toB, message).pipe(Effect.asVoid) }
    const b: Channel<B, A> = { messages: Stream.fromPubSub(toB), send: (message) => PubSub.publish(toA, message).pipe(Effect.asVoid) }
    return [a, b] as const
  })

/**
 * The plugin side: sends the state of the registry, runs each action that comes in, and answers it.
 * JSON has no `undefined`: an argument that was `undefined` in the page (a select of no row) comes
 * as `null`, and goes to the action as `undefined` again.
 */
export const servePlugin = (ui: UiState["Service"], channel: Channel<HostMessage, PluginMessage>) =>
  Effect.gen(function* () {
    // Listen before the whole state is sent: the page drops the patches that it has already.
    yield* ui.messages.pipe(Stream.runForEach(channel.send), Effect.forkScoped({ startImmediately: true }))
    yield* channel.messages.pipe(
      Stream.runForEach((message) =>
        message._tag === "resync"
          ? Effect.flatMap(ui.full, channel.send)
          : Effect.flatMap(ui.run(message.id, message.action, message.args.map((arg) => (arg === null ? undefined : arg))), (accepted) =>
              channel.send({ _tag: "answer", n: message.n, accepted }))),
      Effect.forkScoped({ startImmediately: true })
    )
    yield* Effect.flatMap(ui.full, channel.send)
  })

/** The page side: the copy of the state, the way to send an action, and the ids of the parts whose action was refused. */
export type Host = {
  readonly document: SubscriptionRef.SubscriptionRef<Readonly<Record<string, unknown>>>
  /** Sends an action, and gives true at once: the widget shows the change already, and a refusal comes later in `refused`. */
  readonly act: (id: string, action: string, args: ReadonlyArray<unknown>) => Effect.Effect<boolean>
  readonly refused: Stream.Stream<string>
}

export const connectHost = (channel: Channel<PluginMessage, HostMessage>): Effect.Effect<Host, never, Scope.Scope> =>
  Effect.gen(function* () {
    const document = yield* SubscriptionRef.make<Readonly<Record<string, unknown>>>({})
    const mirror = yield* Ref.make<Mirror | undefined>(undefined)
    const sent = new Map<number, string>()
    const refused = yield* Effect.acquireRelease(PubSub.unbounded<string>(), PubSub.shutdown)
    let n = 0
    yield* channel.messages.pipe(
      Stream.runForEach((message) =>
        Effect.gen(function* () {
          if (message._tag === "answer") {
            const id = sent.get(message.n)
            sent.delete(message.n)
            if (!message.accepted && id !== undefined) yield* PubSub.publish(refused, id)
            return
          }
          const next = receive(yield* Ref.get(mirror), message)
          if (next === "resync") return yield* channel.send({ _tag: "resync" })
          yield* Ref.set(mirror, next)
          yield* SubscriptionRef.set(document, (next.state ?? {}) as Record<string, unknown>)
        })),
      Effect.forkScoped({ startImmediately: true })
    )
    return {
      document,
      refused: Stream.fromPubSub(refused),
      act: (id, action, args) =>
        Effect.suspend(() => {
          sent.set(++n, id)
          return channel.send({ _tag: "action", n, id, action, args }).pipe(Effect.as(true))
        })
    }
  })

/**
 * A remote model: a ref for each field of the state of the part `id`, with its default while the
 * part is not there, and an action for each name that goes to the plugin. A ref changes only when its
 * value changes. When the plugin refuses an action of this part, each ref gives its value again, so a
 * renderer draws it back.
 */
export const remoteModel = <Fields extends Record<string, unknown>>(host: Host, id: string, fields: Fields, actions: ReadonlyArray<string>) =>
  Effect.gen(function* () {
    const valueOf = (document: Readonly<Record<string, unknown>>, name: string) => {
      const part = document[id] as Record<string, unknown> | undefined
      return part?.[name] === undefined ? fields[name] : part[name]
    }
    const now = yield* SubscriptionRef.get(host.document)
    const refs = {} as { [K in keyof Fields]: SubscriptionRef.SubscriptionRef<Fields[K]> }
    for (const name of Object.keys(fields)) (refs as Record<string, unknown>)[name] = yield* SubscriptionRef.make(valueOf(now, name))
    const all = Object.entries(refs) as Array<[string, SubscriptionRef.SubscriptionRef<unknown>]>
    yield* SubscriptionRef.changes(host.document).pipe(
      Stream.runForEach((document) =>
        Effect.forEach(all, ([name, ref]) =>
          Effect.gen(function* () {
            const value = valueOf(document, name)
            if (stableJson(yield* SubscriptionRef.get(ref)) !== stableJson(value)) yield* SubscriptionRef.set(ref, value)
          }), { discard: true })),
      Effect.forkScoped({ startImmediately: true })
    )
    yield* host.refused.pipe(
      Stream.filter((refusedId) => refusedId === id),
      Stream.runForEach(() => Effect.forEach(all, ([, ref]) => Effect.flatMap(SubscriptionRef.get(ref), (value) => SubscriptionRef.set(ref, value)), { discard: true })),
      Effect.forkScoped({ startImmediately: true })
    )
    const act = Object.fromEntries(actions.map((name) => [name, (...args: ReadonlyArray<unknown>) => host.act(id, name, args)]))
    const snapshot = Effect.map(SubscriptionRef.get(host.document), (document) => document[id])
    return {
      ...refs,
      ...act,
      recent: Effect.succeed<ReadonlyArray<Entry>>([]),
      snapshot,
      changes: changesOf(...all.map(([, ref]) => ref))
    }
  })

// The remote model of each type: the fields of its state with their defaults, and its actions. Events
// such as `edits` and `opened` stay in the plugin, so here they are empty.
const noActionArgs = (model: Record<string, unknown>, names: ReadonlyArray<string>) => {
  // An action with no arguments (a zoom) is an Effect on the real model, not a function.
  for (const name of names) model[name] = (model[name] as () => Effect.Effect<boolean>)()
  return model
}

export const remoteValue = <A>(host: Host, id: string, initial: A) =>
  Effect.map(remoteModel(host, id, { value: initial }, VALUE_ACTIONS), (model) => model as unknown as ValueModel<A>)

export const remoteGrid = (host: Host, id: string) =>
  Effect.map(
    remoteModel(host, id, { selected: undefined as string | undefined, sort: undefined as GridSort | undefined, filters: {} as Readonly<Record<string, string>>, rows: [] as ReadonlyArray<Row> }, GRID_ACTIONS),
    (model) => ({ ...model, edits: Stream.empty, chosen: Stream.empty }) as unknown as GridModel & { readonly rows: SubscriptionRef.SubscriptionRef<ReadonlyArray<Row>> }
  )

export const remoteSelection = (host: Host, id: string) =>
  Effect.map(
    remoteModel(host, id, { selected: undefined as string | undefined, rows: [] as ReadonlyArray<Row> }, SELECTION_ACTIONS),
    (model) => model as unknown as SelectionModel & { readonly rows: SubscriptionRef.SubscriptionRef<ReadonlyArray<Row>> }
  )

export const remoteTree = (host: Host, id: string) =>
  Effect.map(
    remoteModel(host, id, { selected: undefined as string | undefined, expanded: [] as ReadonlyArray<string>, rows: [] as ReadonlyArray<Row> }, TREE_ACTIONS),
    (model) => model as unknown as TreeModel & { readonly rows: SubscriptionRef.SubscriptionRef<ReadonlyArray<Row>> }
  )

export const remoteGantt = (host: Host, id: string) =>
  Effect.map(
    remoteModel(host, id, { zoom: "day" as Zoom, tasks: [] as ReadonlyArray<Task> }, GANTT_ACTIONS),
    (model) => noActionArgs(model as unknown as Record<string, unknown>, ["zoomIn", "zoomOut"]) as unknown as GanttModel
  )

export const remoteScheduler = (host: Host, id: string, today: string) =>
  Effect.map(
    remoteModel(host, id, { view: "week" as SchedulerView, date: today, events: [] as ReadonlyArray<CalendarEvent> }, SCHEDULER_ACTIONS),
    (model) => ({ ...model, opened: Stream.empty }) as unknown as SchedulerModel
  )

export const remoteKanban = <R extends Row>(host: Host, id: string) =>
  Effect.map(
    remoteModel(host, id, { selected: undefined as string | undefined, rows: [] as ReadonlyArray<R> }, KANBAN_ACTIONS),
    (model) => ({ ...model, opened: Stream.empty }) as unknown as KanbanModel<R>
  )

/** The remote model of a Toolbar, a Button, a Menu or a Ribbon: only `click`, which goes to the plugin. */
export const remoteClicks = (host: Host, id: string) =>
  Effect.map(remoteModel(host, id, {}, CLICK_ACTIONS), (model) => ({ ...model, clicked: Stream.empty }) as unknown as ClickModel)

/** The remote model of a form: its values and the errors to show; `submit` takes no arguments. */
export const remoteForm = (host: Host, id: string) =>
  Effect.map(
    remoteModel(host, id, { values: {} as Readonly<Record<string, unknown>>, errors: {} as Readonly<Record<string, string>> }, FORM_ACTIONS),
    (model) => ({ ...noActionArgs(model as unknown as Record<string, unknown>, ["submit"]), submitted: Stream.empty }) as unknown as FormModel
  )

/** The remote model of a Chart: its rows and its hidden series; `clicked` stays in the plugin. */
export const remoteChart = (host: Host, id: string) =>
  Effect.map(
    remoteModel(host, id, { rows: [] as ReadonlyArray<Row>, hidden: [] as ReadonlyArray<string> }, CHART_ACTIONS),
    (model) => ({ ...model, clicked: Stream.empty }) as unknown as ChartModel
  )
