import { it } from "@effect/vitest"
import { Effect, Fiber, Stream } from "effect"
import { expect } from "vitest"
import { diagramModel, wellLinked } from "./diagram"

const ITEMS = [
  { id: "plan", type: "rectangle", text: "Plan" },
  { id: "work", type: "rectangle", text: "Work" },
  { id: "line", type: "line", from: "plan", to: "work" }
]

it("takes items with ids and lines between items that are there", () => {
  expect(wellLinked(ITEMS)).toBe(true)
  expect(wellLinked([...ITEMS, { id: "lost", type: "line", from: "plan", to: "nothing" }])).toBe(false)
  expect(wellLinked([{ type: "rectangle" }])).toBe(false)
})

it.effect("selects and clicks a shape, and refuses one that is not there", () =>
  Effect.gen(function* () {
    const model = yield* diagramModel({ items: ITEMS })
    const got = yield* model.clicked.pipe(Stream.take(1), Stream.runCollect, Effect.forkScoped)
    yield* Effect.yieldNow
    expect(yield* model.select("nothing")).toBe(false)
    expect(yield* model.select("work")).toBe(true)
    expect(yield* model.click("nothing")).toBe(false)
    expect(yield* model.click("plan")).toBe(true)
    expect((yield* model.snapshot).selected).toBe("work")
    expect([...(yield* Fiber.join(got))]).toEqual(["plan"])
  }).pipe(Effect.scoped))

it.effect("takes the items of an edit, and refuses an edit with a line to an item that is not there", () =>
  Effect.gen(function* () {
    const model = yield* diagramModel({ items: ITEMS })
    expect(yield* model.edit([...ITEMS, { id: "bad", type: "line", from: "work", to: "nothing" }])).toBe(false)
    expect(yield* model.edit(ITEMS.slice(0, 2))).toBe(true)
    expect((yield* model.snapshot).items.map((item) => item.id)).toEqual(["plan", "work"])
  }).pipe(Effect.scoped))
