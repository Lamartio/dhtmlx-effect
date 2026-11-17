import { it } from "@effect/vitest"
import { Effect, Exit, Fiber, Scope, Stream } from "effect"
import { expect } from "vitest"
import { gridModel } from "./grid"
import { sliderModel } from "./inputs"
import { type Mirror, receive, type StateMessage, uiState } from "./ui-state"

const COLUMNS = [{ id: "title", header: "Title" }]

/** Lets the fibers of the registry run: a change goes through a few of them before it is sent. */
const settle = Effect.forEach(Array.from({ length: 20 }), () => Effect.yieldNow, { discard: true })

it.effect("sends the changes of one tick in one message, and the copy on the other side has the same hash", () =>
  Effect.gen(function* () {
    const ui = yield* uiState
    const got = yield* ui.messages.pipe(Stream.take(2), Stream.runCollect, Effect.forkScoped)
    yield* Effect.yieldNow
    const grid = yield* gridModel({ columns: COLUMNS, rows: [{ id: "a" }, { id: "b" }] })
    const slider = yield* sliderModel({ value: 3 })
    yield* ui.register("grid", grid)
    yield* ui.register("slider", slider)
    yield* settle
    // One tick, three changes.
    yield* grid.select("b")
    yield* grid.sortBy("title")
    yield* slider.set(8)
    yield* settle
    const messages = [...(yield* Fiber.join(got))]
    expect(messages.map((message) => message.seq)).toEqual([1, 2])
    expect(messages[1]!.patch.map((op) => op.path)).toEqual(["/grid/selected", "/grid/sort", "/slider/value"])
    let mirror: Mirror | "resync" | undefined = { seq: 0, state: {} }
    for (const message of messages) mirror = receive(mirror as Mirror, message)
    expect(mirror).toEqual({ seq: 2, state: (yield* ui.full).state })
    expect((yield* ui.full).state).toEqual({
      grid: { selected: "b", sort: { column: "title", dir: "asc" }, filters: {}, rows: [{ id: "a" }, { id: "b" }] },
      slider: { value: 8 }
    })
  }).pipe(Effect.scoped))

it.effect("takes the key of a part out when its scope closes", () =>
  Effect.gen(function* () {
    const ui = yield* uiState
    const scope = yield* Scope.make()
    const slider = yield* sliderModel({ value: 1 }).pipe(Scope.provide(scope))
    yield* ui.register("slider", slider).pipe(Scope.provide(scope))
    yield* settle
    expect((yield* ui.full).state).toEqual({ slider: { value: 1 } })
    yield* Scope.close(scope, Exit.void)
    yield* settle
    expect((yield* ui.full).state).toEqual({})
  }).pipe(Effect.scoped))

it.effect("asks for the whole state again when a patch skips a seq or the hash differs", () =>
  Effect.gen(function* () {
    const mirror: Mirror = { seq: 1, state: { a: 1 } }
    const skip: StateMessage = { _tag: "patch", seq: 3, patch: [], hash: "x" }
    const wrong: StateMessage = { _tag: "patch", seq: 2, patch: [{ op: "replace", path: "/a", value: 2 }], hash: "not the hash" }
    const old: StateMessage = { _tag: "patch", seq: 1, patch: [], hash: "x" }
    expect(receive(mirror, skip)).toBe("resync")
    expect(receive(mirror, wrong)).toBe("resync")
    expect(receive(mirror, old)).toBe(mirror)
    expect(receive(undefined, old)).toBe("resync")
  }))

it.effect("refuses two parts with one id", () =>
  Effect.gen(function* () {
    const ui = yield* uiState
    yield* ui.register("x", yield* sliderModel())
    const exit = yield* Effect.exit(ui.register("x", yield* sliderModel()))
    expect(Exit.isFailure(exit)).toBe(true)
  }).pipe(Effect.scoped))
