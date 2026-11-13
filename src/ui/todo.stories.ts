import type { Meta, StoryObj } from "@storybook/html-vite"
import { Effect, Stream, SubscriptionRef } from "effect"
import "@dhtmlx/todolist/dist/todo.css"
import { element, inside, widgetStory } from "../storybook/story"
import { button } from "./button"
import { column } from "./host"
import { todo, type TodoData } from "./todo"

/** The To Do List. The tasks are in a store: check or change a task, and the store follows. */
const meta: Meta = { title: "To Do List" }
export default meta
type Story = StoryObj

const tasks = (): TodoData => ({
  projects: [{ id: "site", label: "New site" }, { id: "home", label: "Home" }],
  tasks: [
    { id: "a", text: "Write the docs", project: "site" },
    { id: "a1", text: "The install page", parent: "a", project: "site", checked: true },
    { id: "a2", text: "The first example", parent: "a", project: "site" },
    { id: "b", text: "Review the plan", project: "site", checked: true },
    { id: "c", text: "Buy paint", project: "home" }
  ]
})

export const Tasks: Story = {
  render: () =>
    widgetStory(Effect.gen(function* () {
      const data = yield* SubscriptionRef.make(tasks())
      const [controls] = yield* column([
        Effect.gen(function* () {
          const row = yield* element("div", "dhxe-row")
          const add = yield* inside(row, button({ label: "Add a task from the code", color: "secondary" }))
          const out = yield* element("pre", "dhxe-log")
          return { add, out }
        }),
        todo({ data })
      ])
      yield* SubscriptionRef.changes(data).pipe(
        Stream.runForEach((now) => Effect.sync(() => (controls.out.textContent = `${now.tasks.filter((task) => task.checked === true).length} of ${now.tasks.length} tasks are done`))),
        Effect.forkScoped
      )
      let n = 0
      yield* controls.add.clicks.pipe(
        Stream.runForEach(() => SubscriptionRef.update(data, (now) => ({ ...now, tasks: [...now.tasks, { id: `new${++n}`, text: `Task ${n} from the code`, project: "site" }] }))),
        Effect.forkScoped
      )
    }))
}
