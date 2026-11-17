import { it } from "@effect/vitest"
import { Effect } from "effect"
import { expect } from "vitest"
import { consistent, todoModel } from "./todo"

const DATA = {
  tasks: [
    { id: "plan", text: "Plan", project: "web", assigned: ["ann"] },
    { id: "draw", text: "Draw", parent: "plan" }
  ],
  projects: [{ id: "web", label: "Web" }],
  users: [{ id: "ann", label: "Ann" }]
}

it("takes data whose parents, projects and people are there", () => {
  expect(consistent(DATA)).toBe(true)
  expect(consistent({ ...DATA, tasks: [...DATA.tasks, { id: "lost", text: "Lost", parent: "nothing" }] })).toBe(false)
  expect(consistent({ ...DATA, tasks: [{ id: "x", text: "X", project: "nothing" }] })).toBe(false)
  expect(consistent({ ...DATA, tasks: [{ id: "x", text: "X", assigned: ["bob"] }] })).toBe(false)
})

it.effect("takes an edit that checks a task, and refuses one with a subtask of a task that is not there", () =>
  Effect.gen(function* () {
    const model = yield* todoModel({ data: DATA, history: 5 })
    expect(yield* model.edit({ ...DATA, tasks: [{ id: "draw", text: "Draw", parent: "gone" }] })).toBe(false)
    expect(yield* model.edit({ ...DATA, tasks: DATA.tasks.map((task) => (task.id === "draw" ? { ...task, checked: true } : task)) })).toBe(true)
    expect((yield* model.snapshot).data.tasks[1]?.checked).toBe(true)
    expect((yield* model.recent).filter((entry) => entry._tag === "action").length).toBe(1)
  }).pipe(Effect.scoped))
