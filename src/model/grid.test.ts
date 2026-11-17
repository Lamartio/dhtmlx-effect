import { it } from "@effect/vitest"
import { Effect, Fiber, Stream, SubscriptionRef } from "effect"
import { expect } from "vitest"
import { type GridColumn, gridModel } from "./grid"
import { hashOf } from "./model"

const COLUMNS: ReadonlyArray<GridColumn> = [
  { id: "title", header: "Title", filter: "input", editable: true },
  { id: "status", header: "Status", filter: "select" },
  { id: "points", header: "Points", sortable: false }
]
const ROWS = [{ id: "a" }, { id: "b" }, { id: "c" }]

it.effect("starts with no row, no sort and no filter", () =>
  Effect.gen(function* () {
    const model = yield* gridModel({ columns: COLUMNS, rows: ROWS })
    expect(yield* model.snapshot).toEqual({ selected: undefined, sort: undefined, filters: {}, rows: ["a", "b", "c"] })
  }).pipe(Effect.scoped))

it.effect("selects a row, and refuses a row that is not there", () =>
  Effect.gen(function* () {
    const model = yield* gridModel({ columns: COLUMNS, rows: ROWS })
    yield* model.select("b")
    yield* model.select("z")
    expect((yield* model.snapshot).selected).toBe("b")
    yield* model.select(undefined)
    expect((yield* model.snapshot).selected).toBe(undefined)
  }).pipe(Effect.scoped))

it.effect("selects any row when it has no rows, as the renderer checks them", () =>
  Effect.gen(function* () {
    const model = yield* gridModel({ columns: COLUMNS })
    yield* model.select("z")
    expect(yield* model.snapshot).toEqual({ selected: "z", sort: undefined, filters: {} })
  }).pipe(Effect.scoped))

it.effect("follows the rows of a SubscriptionRef that it is given", () =>
  Effect.gen(function* () {
    const rows = yield* SubscriptionRef.make<ReadonlyArray<{ readonly id: string }>>(ROWS)
    const model = yield* gridModel({ columns: COLUMNS, rows })
    yield* model.select("d")
    expect((yield* model.snapshot).selected).toBe(undefined)
    yield* SubscriptionRef.set(rows, [...ROWS, { id: "d" }])
    yield* model.select("d")
    expect(yield* model.snapshot).toEqual({ selected: "d", sort: undefined, filters: {}, rows: ["a", "b", "c", "d"] })
  }).pipe(Effect.scoped))

it.effect("turns the order around on a second sort of the same column", () =>
  Effect.gen(function* () {
    const model = yield* gridModel({ columns: COLUMNS })
    yield* model.sortBy("title")
    expect((yield* model.snapshot).sort).toEqual({ column: "title", dir: "asc" })
    yield* model.sortBy("title")
    expect((yield* model.snapshot).sort).toEqual({ column: "title", dir: "desc" })
    yield* model.sortBy("status")
    expect((yield* model.snapshot).sort).toEqual({ column: "status", dir: "asc" })
    yield* model.sortBy("status", "desc")
    expect((yield* model.snapshot).sort).toEqual({ column: "status", dir: "desc" })
  }).pipe(Effect.scoped))

it.effect("refuses a sort on a column that is not sortable or not there", () =>
  Effect.gen(function* () {
    const model = yield* gridModel({ columns: COLUMNS })
    yield* model.sortBy("points")
    yield* model.sortBy("nothing")
    expect((yield* model.snapshot).sort).toBe(undefined)
  }).pipe(Effect.scoped))

it.effect("keeps the text of each filter, and clears a filter with an empty text", () =>
  Effect.gen(function* () {
    const model = yield* gridModel({ columns: COLUMNS })
    yield* model.filter("title", "Fra")
    yield* model.filter("status", "todo")
    expect((yield* model.snapshot).filters).toEqual({ title: "Fra", status: "todo" })
    yield* model.filter("title", "")
    expect((yield* model.snapshot).filters).toEqual({ status: "todo" })
  }).pipe(Effect.scoped))

it.effect("refuses a filter on a column with no filter", () =>
  Effect.gen(function* () {
    const model = yield* gridModel({ columns: COLUMNS })
    yield* model.filter("points", "3")
    expect((yield* model.snapshot).filters).toEqual({})
  }).pipe(Effect.scoped))

it.effect("gives an edit of an editable column, and refuses the others", () =>
  Effect.gen(function* () {
    const model = yield* gridModel({ columns: COLUMNS, rows: ROWS })
    const got = yield* model.edits.pipe(Stream.take(1), Stream.runCollect, Effect.forkScoped)
    yield* Effect.yieldNow
    yield* model.edit("a", "status", "done")
    yield* model.edit("z", "title", "Lost")
    yield* model.edit("a", "title", "Frames and more")
    expect([...(yield* Fiber.join(got))]).toEqual([{ row: "a", column: "title", value: "Frames and more" }])
  }).pipe(Effect.scoped))

it.effect("keeps the actions, the inputs and the events in its history", () =>
  Effect.gen(function* () {
    const model = yield* gridModel({ columns: COLUMNS, rows: ROWS, history: 20 })
    yield* model.select("a")
    yield* model.sortBy("title")
    yield* model.edit("a", "title", "New")
    const tags = (yield* model.recent).map((entry) => `${entry._tag} ${entry.name}`)
    expect(tags).toEqual([
      "input selected",
      "input sort",
      "input filters",
      "action select",
      "input selected",
      "action sortBy",
      "input sort",
      "action edit",
      "event edits"
    ])
  }).pipe(Effect.scoped))

it.effect("gives the same hash for the same intent", () =>
  Effect.gen(function* () {
    const one = yield* gridModel({ columns: COLUMNS })
    const two = yield* gridModel({ columns: COLUMNS })
    yield* one.filter("status", "todo")
    yield* one.sortBy("title")
    yield* two.sortBy("title")
    yield* two.filter("status", "todo")
    expect(yield* hashOf(yield* one.snapshot)).toBe(yield* hashOf(yield* two.snapshot))
  }).pipe(Effect.scoped))
