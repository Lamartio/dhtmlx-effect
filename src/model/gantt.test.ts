import { it } from "@effect/vitest"
import { Effect, SubscriptionRef } from "effect"
import { expect } from "vitest"
import { ganttModel, type Task } from "./gantt"

const PLAN: ReadonlyArray<Task> = [
  { id: "m1", text: "Milestone", start: "2026-11-09", duration: 10, progress: 0 },
  { id: "t1", text: "Design", start: "2026-11-09", duration: 3, progress: 1, parent: "m1" },
  { id: "t2", text: "Build", start: "2026-11-12", duration: 5, progress: 0.2, parent: "m1" }
]

it.effect("zooms in and out between day and month, and stops at the ends", () =>
  Effect.gen(function* () {
    const model = yield* ganttModel({ tasks: PLAN })
    yield* model.zoomOut
    expect((yield* model.snapshot).zoom).toBe("week")
    yield* model.zoomOut
    yield* model.zoomOut
    expect((yield* model.snapshot).zoom).toBe("month")
    yield* model.zoomIn
    yield* model.zoomIn
    yield* model.zoomIn
    expect((yield* model.snapshot).zoom).toBe("day")
  }).pipe(Effect.scoped))

it.effect("adds a task of two days from now", () =>
  Effect.gen(function* () {
    const model = yield* ganttModel({ tasks: PLAN })
    yield* model.addTask("Test", new Date(2026, 10, 17, 9))
    const added = (yield* model.snapshot).tasks.at(-1)
    expect(added).toMatchObject({ text: "Test", start: "2026-11-17", duration: 2, progress: 0 })
  }).pipe(Effect.scoped))

it.effect("puts a task that the user moved, and a new one that the user made", () =>
  Effect.gen(function* () {
    const tasks = yield* SubscriptionRef.make(PLAN)
    const model = yield* ganttModel({ tasks })
    yield* model.putTask({ ...PLAN[2]!, start: "2026-11-14" })
    yield* model.putTask({ id: "t3", text: "Ship", start: "2026-11-19", duration: 1, progress: 0, parent: "m1" })
    const now = yield* SubscriptionRef.get(tasks)
    expect(now.find((task) => task.id === "t2")?.start).toBe("2026-11-14")
    expect(now.map((task) => task.id)).toEqual(["m1", "t1", "t2", "t3"])
  }).pipe(Effect.scoped))

it.effect("refuses a task under a parent that is not in the plan", () =>
  Effect.gen(function* () {
    const model = yield* ganttModel({ tasks: PLAN })
    yield* model.putTask({ id: "t9", text: "Lost", start: "2026-11-19", duration: 1, progress: 0, parent: "nothing" })
    expect((yield* model.snapshot).tasks).toEqual(PLAN)
  }).pipe(Effect.scoped))

it.effect("removes a task with its children, and refuses a task that is not there", () =>
  Effect.gen(function* () {
    const model = yield* ganttModel({ tasks: PLAN, history: 10 })
    yield* model.removeTask("nothing")
    yield* model.removeTask("m1")
    expect((yield* model.snapshot).tasks).toEqual([])
    expect((yield* model.recent).filter((entry) => entry._tag === "action")).toEqual([{ _tag: "action", name: "removeTask", value: "m1" }])
  }).pipe(Effect.scoped))
