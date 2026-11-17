import { it } from "@effect/vitest"
import { Effect, Fiber, Stream } from "effect"
import { expect } from "vitest"
import { type CalendarEvent, schedulerModel } from "./scheduler"

const EVENTS: ReadonlyArray<CalendarEvent> = [
  { id: "a", text: "Stand-up", start: "2026-11-17T08:00:00Z", end: "2026-11-17T08:15:00Z" },
  { id: "b", text: "Review", start: "2026-11-18T13:00:00Z", end: "2026-11-18T14:00:00Z" }
]

it.effect("starts on the week of the day it is given", () =>
  Effect.gen(function* () {
    const model = yield* schedulerModel({ events: EVENTS, date: "2026-11-17" })
    expect(yield* model.snapshot).toEqual({ view: "week", date: "2026-11-17", events: EVENTS })
  }).pipe(Effect.scoped))

it.effect("changes the view and the day, and refuses a day that is not YYYY-MM-DD", () =>
  Effect.gen(function* () {
    const model = yield* schedulerModel({ events: EVENTS, date: "2026-11-17" })
    yield* model.showView("month")
    yield* model.showDate("2026-12-01")
    yield* model.showDate("1 Dec")
    const { view, date } = yield* model.snapshot
    expect({ view, date }).toEqual({ view: "month", date: "2026-12-01" })
  }).pipe(Effect.scoped))

it.effect("moves an event, and refuses one that ends before it starts or that is not there", () =>
  Effect.gen(function* () {
    const model = yield* schedulerModel({ events: EVENTS })
    yield* model.updateEvent({ ...EVENTS[0]!, start: "2026-11-17T09:00:00Z", end: "2026-11-17T09:15:00Z" })
    yield* model.updateEvent({ ...EVENTS[1]!, end: "2026-11-18T12:00:00Z" })
    yield* model.updateEvent({ id: "z", text: "Lost", start: "2026-11-17T09:00:00Z", end: "2026-11-17T10:00:00Z" })
    expect((yield* model.snapshot).events).toEqual([{ ...EVENTS[0]!, start: "2026-11-17T09:00:00Z", end: "2026-11-17T09:15:00Z" }, EVENTS[1]])
  }).pipe(Effect.scoped))

it.effect("removes an event, and refuses one that is not there", () =>
  Effect.gen(function* () {
    const model = yield* schedulerModel({ events: EVENTS })
    yield* model.removeEvent("z")
    yield* model.removeEvent("a")
    expect((yield* model.snapshot).events).toEqual([EVENTS[1]])
  }).pipe(Effect.scoped))

it.effect("gives each event that is opened, and keeps it in its history", () =>
  Effect.gen(function* () {
    const model = yield* schedulerModel({ events: EVENTS, history: 10 })
    const got = yield* model.opened.pipe(Stream.take(1), Stream.runCollect, Effect.forkScoped)
    yield* Effect.yieldNow
    yield* model.open("z")
    yield* model.open("b")
    expect([...(yield* Fiber.join(got))]).toEqual(["b"])
    expect((yield* model.recent).slice(-2)).toEqual([
      { _tag: "action", name: "open", value: "b" },
      { _tag: "event", name: "opened", value: "b" }
    ])
  }).pipe(Effect.scoped))
