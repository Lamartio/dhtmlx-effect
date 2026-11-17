import { it } from "@effect/vitest"
import { Effect, Fiber, Stream } from "effect"
import { expect } from "vitest"
import { chartModel, seriesIds } from "./chart"

const ROWS = [{ id: "jan", done: 3 }, { id: "feb", done: 5 }]

it("takes the id of a series, or its value field", () => {
  expect(seriesIds({ series: [{ id: "a", value: "done" }, { value: "open" }] })).toEqual(["a", "open"])
})

it.effect("hides and shows a series, and refuses one that is not there", () =>
  Effect.gen(function* () {
    const model = yield* chartModel(["done", "open"], { rows: ROWS })
    expect(yield* model.toggle("done")).toBe(true)
    expect(yield* model.toggle("lost")).toBe(false)
    expect((yield* model.snapshot).hidden).toEqual(["done"])
    yield* model.toggle("done")
    expect((yield* model.snapshot).hidden).toEqual([])
  }).pipe(Effect.scoped))

it.effect("gives a click on a point, and refuses a row or a series that is not there", () =>
  Effect.gen(function* () {
    const model = yield* chartModel(["done"], { rows: ROWS })
    const got = yield* model.clicked.pipe(Stream.take(1), Stream.runCollect, Effect.forkScoped)
    yield* Effect.yieldNow
    expect(yield* model.click("done", "mar")).toBe(false)
    expect(yield* model.click("open", "jan")).toBe(false)
    expect(yield* model.click("done", "feb")).toBe(true)
    expect([...(yield* Fiber.join(got))]).toEqual([{ series: "done", row: "feb" }])
  }).pipe(Effect.scoped))
