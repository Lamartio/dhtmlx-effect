import { it } from "@effect/vitest"
import { Effect, SubscriptionRef } from "effect"
import { expect } from "vitest"
import "@dhtmlx/todolist/dist/todo.css"
import { Browser, setFacts } from "./browser"
import { alive, Host } from "./host"
import { todo, type TodoData } from "./todo"
import { run, settle } from "./wx-test"

const DATA: TodoData = {
  tasks: [
    { id: "a", text: "Write the docs" },
    { id: "b", text: "Review the plan", checked: true },
    { id: "c", text: "Ask for feedback", parent: "a" }
  ]
}

it.live("shows the tasks of the store, and a new value from the code", () =>
  run(Effect.gen(function* () {
    const host = yield* Host
    const data = yield* SubscriptionRef.make(DATA)
    const made = yield* todo({ data })
    yield* settle
    expect(host.textContent).toContain("Write the docs")
    expect(host.textContent).toContain("Ask for feedback")
    expect(made.todo.existsTask({ id: "b" })).toBe(true)
    // The list only showed the tasks: the store has the same value.
    expect(yield* SubscriptionRef.get(data)).toBe(DATA)

    yield* SubscriptionRef.set(data, { tasks: [{ id: "x", text: "One other task" }] })
    yield* settle
    expect(host.textContent).toContain("One other task")
    expect(host.textContent).not.toContain("Write the docs")
    expect((yield* SubscriptionRef.get(alive)).get("todo")).toBe(1)
  })))

it.live("writes a check, a new text and a new task of the user into the store", () =>
  run(Effect.gen(function* () {
    const data = yield* SubscriptionRef.make(DATA)
    const made = yield* todo({ data })
    yield* settle
    const task = (id: string) => Effect.map(SubscriptionRef.get(data), (all) => all.tasks.find((one) => String(one.id) === id))

    made.todo.checkTask({ id: "a", manual: true })
    yield* settle
    expect((yield* task("a"))?.checked).toBe(true)

    made.todo.updateTask({ id: "b", task: { text: "Review the new plan" } })
    yield* settle
    expect((yield* task("b"))?.text).toBe("Review the new plan")

    made.todo.addTask({ id: "d", task: { text: "A task of the user" } })
    yield* settle
    expect((yield* task("d"))?.text).toBe("A task of the user")
    expect((yield* SubscriptionRef.get(data)).tasks.length).toBe(4)
  })))

it.live("puts the theme of the Browser on its host", () =>
  run(Effect.gen(function* () {
    const host = yield* Host
    const browser = yield* Browser
    yield* todo({ data: yield* SubscriptionRef.make(DATA) })
    yield* settle
    expect(host.classList.contains("wx-willow-theme")).toBe(true)
    yield* setFacts(browser, { dark: true })
    yield* settle
    expect(host.classList.contains("wx-willow-dark-theme")).toBe(true)
    expect(host.classList.contains("wx-willow-theme")).toBe(false)
  })))
