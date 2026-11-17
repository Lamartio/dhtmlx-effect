import { it } from "@effect/vitest"
import { Effect, Fiber, Stream } from "effect"
import { expect } from "vitest"
import { clickable, clickModel, type MenuItem } from "./clicks"
import { gridModel } from "./grid"

const ITEMS: ReadonlyArray<MenuItem> = [
  { id: "new", label: "New" },
  { separator: true },
  { id: "export", label: "Export", items: [{ id: "csv", label: "CSV" }, { id: "pdf", label: "PDF", disabled: true }] },
  { id: "delete", label: "Delete", disabled: true }
]

it("takes as clickable only the items that are not disabled, a separator or a sub menu", () => {
  expect(clickable(ITEMS)).toEqual(["new", "csv"])
})

it.effect("gives a click that it takes as an event, and refuses the others", () =>
  Effect.gen(function* () {
    const model = yield* clickModel(clickable(ITEMS))
    const got = yield* model.clicked.pipe(Stream.take(2), Stream.runCollect, Effect.forkScoped)
    yield* Effect.yieldNow
    expect(yield* model.click("delete")).toBe(false)
    expect(yield* model.click("export")).toBe(false)
    expect(yield* model.click("new")).toBe(true)
    expect(yield* model.click("csv")).toBe(true)
    expect([...(yield* Fiber.join(got))]).toEqual(["new", "csv"])
  }).pipe(Effect.scoped))

it.effect("gives the choice of the context menu of a Grid with its row", () =>
  Effect.gen(function* () {
    const model = yield* gridModel({ columns: [{ id: "title", header: "Title" }], rows: [{ id: "a" }], menu: ITEMS })
    const got = yield* model.chosen.pipe(Stream.take(1), Stream.runCollect, Effect.forkScoped)
    yield* Effect.yieldNow
    expect(yield* model.choose("a", "delete")).toBe(false)
    expect(yield* model.choose("z", "new")).toBe(false)
    expect(yield* model.choose("a", "new")).toBe(true)
    expect([...(yield* Fiber.join(got))]).toEqual([{ row: "a", item: "new" }])
  }).pipe(Effect.scoped))
