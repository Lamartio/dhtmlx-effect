import { Effect, PubSub, type Scope, Stream, SubscriptionRef } from "effect"
import { day } from "./gantt"
import { type Entry, history, type Input, input, recordInput } from "./model"

/** One event. `start` and `end` are instants (ISO 8601 with a zone); the Scheduler shows them in `Browser.timeZone`. */
export type CalendarEvent = {
  readonly id: string
  readonly text: string
  readonly start: string
  readonly end: string
}

export type SchedulerView = "day" | "week" | "month"

export type SchedulerState = { readonly view: SchedulerView; readonly date: string; readonly events: ReadonlyArray<CalendarEvent> }

export type SchedulerModel = {
  readonly events: SubscriptionRef.SubscriptionRef<ReadonlyArray<CalendarEvent>>
  readonly view: SubscriptionRef.SubscriptionRef<SchedulerView>
  /** The day in view, `YYYY-MM-DD`. */
  readonly date: SubscriptionRef.SubscriptionRef<string>
  /** The id of each event that the user opens. */
  readonly opened: Stream.Stream<string>
  readonly showView: (view: SchedulerView) => Effect.Effect<void>
  /** A day that is not `YYYY-MM-DD` changes nothing. */
  readonly showDate: (date: string) => Effect.Effect<void>
  /** An event that the user moved or resized. An event that is not there, or that ends before it starts, changes nothing. */
  readonly updateEvent: (event: CalendarEvent) => Effect.Effect<void>
  /** An event that is not there changes nothing. */
  readonly removeEvent: (id: string) => Effect.Effect<void>
  /** Opens an event: it goes out in `opened`. An event that is not there changes nothing. */
  readonly open: (id: string) => Effect.Effect<void>
  readonly recent: Effect.Effect<ReadonlyArray<Entry>>
  readonly snapshot: Effect.Effect<SchedulerState>
}

export type SchedulerModelOptions = {
  readonly events: Input<ReadonlyArray<CalendarEvent>>
  /** Default: `week`. */
  readonly view?: Input<SchedulerView>
  /** The day in view, `YYYY-MM-DD`. Default: today, in the time of the browser. */
  readonly date?: Input<string>
  /** How many entries `recent` keeps. Default: 0. */
  readonly history?: number
}

/** The model of a Scheduler: the events as input, the view and the day in view as intent. */
export const schedulerModel = (options: SchedulerModelOptions): Effect.Effect<SchedulerModel, never, Scope.Scope> =>
  Effect.gen(function* () {
    const events = yield* input<ReadonlyArray<CalendarEvent>>(options.events, [])
    const view = yield* input<SchedulerView>(options.view, "week")
    const date = yield* input(options.date, day(new Date()))
    const opened = yield* Effect.acquireRelease(PubSub.unbounded<string>(), PubSub.shutdown)
    const log = yield* history(options.history ?? 0)
    yield* recordInput(log, "events", events)
    yield* recordInput(log, "view", view)
    yield* recordInput(log, "date", date)
    const action = (name: string, value: unknown) => log.record({ _tag: "action", name, value })
    const has = (id: string) => Effect.map(SubscriptionRef.get(events), (all) => all.some((event) => event.id === id))
    const set = <A>(ref: SubscriptionRef.SubscriptionRef<A>, value: A) =>
      Effect.flatMap(SubscriptionRef.get(ref), (now) => (now === value ? Effect.void : SubscriptionRef.set(ref, value)))
    return {
      events,
      view,
      date,
      opened: Stream.fromPubSub(opened),
      showView: (next) => action("showView", next).pipe(Effect.andThen(set(view, next))),
      showDate: (next) =>
        /^\d{4}-\d{2}-\d{2}$/.test(next) ? action("showDate", next).pipe(Effect.andThen(set(date, next))) : Effect.void,
      updateEvent: (event) =>
        Effect.gen(function* () {
          if (!(yield* has(event.id)) || Date.parse(event.end) < Date.parse(event.start)) return
          yield* action("updateEvent", event)
          yield* SubscriptionRef.update(events, (all) => all.map((one) => (one.id === event.id ? event : one)))
        }),
      removeEvent: (id) =>
        Effect.gen(function* () {
          if (!(yield* has(id))) return
          yield* action("removeEvent", id)
          yield* SubscriptionRef.update(events, (all) => all.filter((one) => one.id !== id))
        }),
      open: (id) =>
        Effect.gen(function* () {
          if (!(yield* has(id))) return
          yield* action("open", id)
          yield* PubSub.publish(opened, id)
          yield* log.record({ _tag: "event", name: "opened", value: id })
        }),
      recent: log.recent,
      snapshot: Effect.all({ view: SubscriptionRef.get(view), date: SubscriptionRef.get(date), events: SubscriptionRef.get(events) })
    }
  })
