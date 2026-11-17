import { it } from "@effect/vitest"
import { Effect, Fiber, Stream } from "effect"
import { expect } from "vitest"
import { bookingModel } from "./booking"
import { pivotModel } from "./pivot"
import { spreadsheetModel } from "./spreadsheet"

const NINE = Date.UTC(2026, 10, 18, 9)

it.effect("books a free slot once, and refuses a slot that is taken or a card that is not there", () =>
  Effect.gen(function* () {
    const model = yield* bookingModel({ cards: [{ id: "ann", title: "Ann" }] })
    const got = yield* model.confirmed.pipe(Stream.take(1), Stream.runCollect, Effect.forkScoped)
    yield* Effect.yieldNow
    expect(yield* model.book("bob", NINE, 30, {})).toBe(false)
    expect(yield* model.book("ann", NINE, 30, { name: "Kim" })).toBe(true)
    expect(yield* model.book("ann", NINE, 30, { name: "Lee" })).toBe(false)
    expect((yield* model.snapshot).cards[0]?.usedSlots).toEqual([NINE])
    expect([...(yield* Fiber.join(got))]).toEqual([{ card: "ann", start: NINE, minutes: 30, form: { name: "Kim" } }])
  }).pipe(Effect.scoped))

it.effect("takes a build of the pivot with its fields, and refuses a field that is not there", () =>
  Effect.gen(function* () {
    const model = yield* pivotModel([{ id: "team", type: "text" }, { id: "hours", type: "number" }], { rows: [] })
    expect(yield* model.configure({ rows: ["team"], values: [{ field: "cost", method: "sum" }] })).toBe(false)
    expect(yield* model.configure({ rows: ["team"], values: [{ field: "hours", method: "sum" }] })).toBe(true)
    expect((yield* model.snapshot).config.rows).toEqual(["team"])
  }).pipe(Effect.scoped))

it.effect("takes the cells of an edit as the user typed them, and refuses a cell with no name", () =>
  Effect.gen(function* () {
    const model = yield* spreadsheetModel({ data: [{ cell: "A1", value: 2 }] })
    expect(yield* model.edit([{ value: 3 } as never])).toBe(false)
    expect(yield* model.edit({ sheets: [{ data: [{ value: 3 }] }] })).toBe(false)
    expect(yield* model.edit([{ cell: "A1", value: 2 }, { cell: "A2", value: "=A1*2" }])).toBe(true)
    expect((yield* model.snapshot).data).toEqual([{ cell: "A1", value: 2 }, { cell: "A2", value: "=A1*2" }])
  }).pipe(Effect.scoped))
