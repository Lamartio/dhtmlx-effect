import { it } from "@effect/vitest"
import { Effect, Fiber, Stream } from "effect"
import { expect } from "vitest"
import { type KanbanColumn, kanbanModel } from "./kanban"

type Issue = { readonly id: string; readonly status: string; readonly team: string }
const ISSUES: ReadonlyArray<Issue> = [
  { id: "a", status: "todo", team: "web" },
  { id: "b", status: "todo", team: "app" },
  { id: "c", status: "doing", team: "web" }
]
const COLUMNS: ReadonlyArray<KanbanColumn> = [
  { id: "todo", label: "To do" },
  { id: "doing", label: "Doing", limit: 1, strictLimit: true },
  { id: "done", label: "Done", limit: 1 }
]
const LANES = { field: "team" as const, rows: [{ id: "web", label: "Web" }, { id: "app", label: "App" }] }

it.effect("moves a card to another column and lane", () =>
  Effect.gen(function* () {
    const model = yield* kanbanModel({ rows: ISSUES, field: "status", columns: COLUMNS, lanes: LANES })
    yield* model.move("a", "done", "app")
    expect((yield* model.snapshot).cards["a"]).toEqual({ column: "done", lane: "app" })
  }).pipe(Effect.scoped))

it.effect("refuses a move into a full column with strictLimit, and allows one past a soft limit", () =>
  Effect.gen(function* () {
    const model = yield* kanbanModel({ rows: ISSUES, field: "status", columns: COLUMNS })
    yield* model.move("a", "doing")
    expect((yield* model.snapshot).cards["a"]).toEqual({ column: "todo" })
    yield* model.move("a", "done")
    yield* model.move("b", "done")
    expect((yield* model.snapshot).cards["b"]).toEqual({ column: "done" })
  }).pipe(Effect.scoped))

it.effect("refuses a move of a row, to a column or to a lane that is not there", () =>
  Effect.gen(function* () {
    const model = yield* kanbanModel({ rows: ISSUES, field: "status", columns: COLUMNS, lanes: LANES, history: 10 })
    yield* model.move("z", "done")
    yield* model.move("a", "lost")
    yield* model.move("a", "done", "lost")
    yield* model.move("a", "todo", "web")
    expect((yield* model.recent).filter((entry) => entry._tag === "action")).toEqual([])
  }).pipe(Effect.scoped))

it.effect("selects and opens a card, and refuses one that is not there", () =>
  Effect.gen(function* () {
    const model = yield* kanbanModel({ rows: ISSUES, field: "status", columns: COLUMNS })
    const got = yield* model.opened.pipe(Stream.take(1), Stream.runCollect, Effect.forkScoped)
    yield* Effect.yieldNow
    yield* model.select("z")
    yield* model.open("z")
    yield* model.select("c")
    yield* model.open("c")
    expect((yield* model.snapshot).selected).toBe("c")
    expect([...(yield* Fiber.join(got))]).toEqual(["c"])
  }).pipe(Effect.scoped))
