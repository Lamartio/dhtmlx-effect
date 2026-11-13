import { expect, it } from "vitest"
import type { Task } from "./gantt"
import { diffPlan, planWith } from "./plan-diff"

const A: Task = { id: "a", text: "Design", start: "2026-11-02", duration: 4, progress: 1 }
const B: Task = { id: "b", text: "Build", start: "2026-11-06", duration: 6, progress: 0.4 }
const C: Task = { id: "c", text: "Ship", start: "2026-11-12", duration: 1, progress: 0 }

it("gives no changes for the same plan, also when the array is new", () => {
  expect(diffPlan([A, B], [{ ...A }, { ...B }])).toEqual([])
})

it("gives an update with the whole task when one field changed", () => {
  expect(diffPlan([A, B], [A, { ...B, duration: 8 }])).toEqual([{ _tag: "update", task: { ...B, duration: 8 } }])
})

it("gives an add with the index among the siblings, and a remove", () => {
  expect(diffPlan([A, B], [A, C])).toEqual([
    { _tag: "remove", id: "b" },
    { _tag: "add", task: C, index: 1 }
  ])
})

it("gives a move when a task gets another parent or another place", () => {
  const child = { ...C, parent: "a" }
  expect(diffPlan([A, B, C], [A, B, child])).toEqual([{ _tag: "move", id: "c", parent: "a", index: 0 }])
  expect(diffPlan([A, B], [B, A])).toEqual([
    { _tag: "move", id: "b", parent: undefined, index: 0 },
    { _tag: "move", id: "a", parent: undefined, index: 1 }
  ])
})

it("puts a new parent before its new child, so the Gantt can add both", () => {
  const ops = diffPlan([], [C, { ...A, parent: "c" }])
  expect(ops.map((op) => (op._tag === "add" ? op.task.id : op._tag))).toEqual(["c", "a"])
})

it("changes one task of the plan, or removes it with its children", () => {
  expect(planWith([A, B], { put: { ...B, text: "Build it" } }).map((task) => task.text)).toEqual(["Design", "Build it"])
  expect(planWith([A, B], { put: C }).map((task) => task.id)).toEqual(["a", "b", "c"])
  expect(planWith([A, { ...B, parent: "a" }, C], { remove: "a" }).map((task) => task.id)).toEqual(["c"])
})
