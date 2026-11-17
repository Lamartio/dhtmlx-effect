import { it } from "@effect/vitest"
import { Effect, Queue, Stream, SubscriptionRef } from "effect"
import { expect } from "vitest"
import { calendarModel, colorpickerModel, comboboxModel, sliderModel, timepickerModel } from "./inputs"
import { hashOf, stableJson } from "./model"

it.effect("starts each input model at its default, or at the value it is given", () =>
  Effect.gen(function* () {
    expect(yield* (yield* calendarModel()).snapshot).toEqual({ value: undefined })
    expect(yield* (yield* timepickerModel()).snapshot).toEqual({ value: "09:00" })
    expect(yield* (yield* sliderModel({ min: 3 })).snapshot).toEqual({ value: 3 })
    expect(yield* (yield* colorpickerModel()).snapshot).toEqual({ value: "#2e7dd1" })
    expect(yield* (yield* comboboxModel({ options: [], value: "todo" })).snapshot).toEqual({ value: "todo" })
  }).pipe(Effect.scoped))

it.effect("shares a SubscriptionRef that it is given, both ways", () =>
  Effect.gen(function* () {
    const points = yield* SubscriptionRef.make(5)
    const model = yield* sliderModel({ value: points })
    yield* model.set(8)
    expect(yield* SubscriptionRef.get(points)).toBe(8)
    yield* SubscriptionRef.set(points, 2)
    expect(yield* model.snapshot).toEqual({ value: 2 })
  }).pipe(Effect.scoped))

it.effect("follows each value of a Stream that it is given", () =>
  Effect.gen(function* () {
    const days = yield* Queue.unbounded<string>()
    const model = yield* calendarModel({ value: Stream.fromQueue(days) })
    expect(yield* model.snapshot).toEqual({ value: undefined })
    yield* Queue.offer(days, "2026-11-20")
    yield* Effect.yieldNow
    expect(yield* model.snapshot).toEqual({ value: "2026-11-20" })
  }).pipe(Effect.scoped))

it.effect("refuses an option that a combobox does not have", () =>
  Effect.gen(function* () {
    const model = yield* comboboxModel({ options: [{ value: "todo" }, { value: "done" }] })
    yield* model.set("done")
    yield* model.set("lost")
    expect(yield* model.snapshot).toEqual({ value: "done" })
    yield* model.set(undefined)
    expect(yield* model.snapshot).toEqual({ value: undefined })
  }).pipe(Effect.scoped))

it.effect("keeps a colour as it is when the user picks the same colour in capitals", () =>
  Effect.gen(function* () {
    const model = yield* colorpickerModel({ value: "#ff0000" })
    yield* model.set("#FF0000")
    expect(yield* model.snapshot).toEqual({ value: "#ff0000" })
  }).pipe(Effect.scoped))

it.effect("keeps the last entries of the inputs and the actions, as many as history says", () =>
  Effect.gen(function* () {
    const time = yield* SubscriptionRef.make("14:45")
    const model = yield* timepickerModel({ value: time, history: 3 })
    yield* model.set("08:15")
    yield* SubscriptionRef.set(time, "10:00")
    expect(yield* model.recent).toEqual([
      { _tag: "action", name: "set", value: "08:15" },
      { _tag: "input", name: "value", value: "08:15" },
      { _tag: "input", name: "value", value: "10:00" }
    ])
  }).pipe(Effect.scoped))

it.effect("keeps no history by default", () =>
  Effect.gen(function* () {
    const model = yield* sliderModel()
    yield* model.set(4)
    expect(yield* model.recent).toEqual([])
  }).pipe(Effect.scoped))

it.effect("gives the same hash for the same state, and another one after a change", () =>
  Effect.gen(function* () {
    const model = yield* sliderModel({ value: 3 })
    const before = yield* hashOf(yield* model.snapshot)
    expect(yield* hashOf({ value: 3 })).toBe(before)
    yield* model.set(5)
    expect(yield* hashOf(yield* model.snapshot)).not.toBe(before)
    expect(before).toMatch(/^[0-9a-f]{64}$/)
  }).pipe(Effect.scoped))

it("writes JSON with the keys in order, so the order of the fields does not matter", () => {
  expect(stableJson({ b: 1, a: { d: [2, { y: 1, x: 0 }], c: new Date("2026-11-17T00:00:00Z") } })).toBe(
    '{"a":{"c":"2026-11-17T00:00:00.000Z","d":[2,{"x":0,"y":1}]},"b":1}'
  )
})
