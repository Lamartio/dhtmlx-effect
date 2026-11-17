import { it } from "@effect/vitest"
import { Effect, Fiber, Schema, Stream } from "effect"
import { expect } from "vitest"
import { type Field, formModel, rulesCheck, schemaCheck } from "./form"

const FIELDS: ReadonlyArray<Field> = [
  { name: "title", kind: "text", required: true },
  { name: "code", kind: "text", pattern: "^[A-Z]{3}$", message: "Three capitals" },
  { name: "points", kind: "number", min: 0, max: 13 }
]

it.effect("shows the error of a field only after the user changed it, and all after a send", () =>
  Effect.gen(function* () {
    const model = yield* formModel(rulesCheck(FIELDS), FIELDS)
    expect((yield* model.snapshot).errors).toEqual({})
    yield* model.change("code", "abc")
    yield* Effect.yieldNow
    expect((yield* model.snapshot).errors).toEqual({ code: "Three capitals" })
    expect(yield* model.submit).toBe(false)
    expect((yield* model.snapshot).errors).toEqual({ title: "Fill this in", code: "Three capitals" })
  }).pipe(Effect.scoped))

it.effect("gives a value that passes its rules when it is sent, and refuses a field that is not there", () =>
  Effect.gen(function* () {
    const model = yield* formModel(rulesCheck(FIELDS), FIELDS)
    const got = yield* model.submitted.pipe(Stream.take(1), Stream.runCollect, Effect.forkScoped)
    yield* Effect.yieldNow
    expect(yield* model.change("nothing", 1)).toBe(false)
    yield* model.change("title", "Plan")
    yield* model.change("points", 20)
    expect(yield* model.submit).toBe(false)
    yield* model.change("points", 8)
    expect(yield* model.submit).toBe(true)
    expect([...(yield* Fiber.join(got))]).toEqual([{ title: "Plan", points: 8 }])
  }).pipe(Effect.scoped))

it.effect("checks with an Effect Schema in code, and gives the typed value", () =>
  Effect.gen(function* () {
    const schema = Schema.Struct({ title: Schema.String, points: Schema.Number })
    const model = yield* formModel(schemaCheck(schema), [{ name: "title" }, { name: "points", kind: "number" }])
    yield* model.change("title", "Plan")
    expect(yield* model.submit).toBe(false)
    expect(Object.keys((yield* model.snapshot).errors)).toEqual(["points"])
    yield* model.change("points", 3)
    expect(yield* model.submit).toBe(true)
  }).pipe(Effect.scoped))
