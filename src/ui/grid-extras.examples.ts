import type { StoryObj } from "@storybook/html-vite"
import { Effect, SubscriptionRef, Stream } from "effect"
import { element, widgetStory } from "../storybook/story"
import { dataCollection, grid } from "./data"
import { column } from "./host"
import { forEachReported } from "./problems"

/**
 * A Grid that the user can edit and filter. An edit is a value of a stream: the story writes it into
 * the store, and the Grid follows the store.
 */
type Story = StoryObj

type Issue = { readonly id: string; readonly title: string; readonly status: string; readonly points: number; readonly urgent: boolean }

const STATUSES = ["backlog", "todo", "doing", "done"]

const issues = (): ReadonlyArray<Issue> => [
  { id: "075", title: "Frames", status: "done", points: 5, urgent: false },
  { id: "076", title: "Data", status: "done", points: 8, urgent: false },
  { id: "077", title: "Forms", status: "doing", points: 8, urgent: true },
  { id: "078", title: "Menus and messages", status: "todo", points: 3, urgent: false },
  { id: "079", title: "Scheduler", status: "todo", points: 5, urgent: true },
  { id: "080", title: "Kanban", status: "backlog", points: 2, urgent: false }
]

export const EditAndFilter: Story = {
  name: "Edit and filter",
  render: () =>
    widgetStory(Effect.gen(function* () {
      const rows = yield* SubscriptionRef.make(issues())
      const data = yield* dataCollection(rows)
      const [log, made] = yield* column([
        Effect.gen(function* () {
          yield* element("p", "dhxe-note", "Double-click a cell to change it. Type in the header of Title, or choose a status, to filter the rows.")
          return yield* element("pre", "dhxe-log", "No edit yet.")
        }),
        grid({
          data,
          columns: [
            { id: "id", header: "#", width: 70 },
            { id: "title", header: "Title", editable: true, filter: "input", resizable: true },
            { id: "status", header: "Status", width: 160, editable: true, editor: "select", options: STATUSES, filter: "select" },
            { id: "points", header: "Points", width: 110, type: "number", align: "right", editable: true },
            { id: "urgent", header: "Urgent", width: 100, type: "boolean", editable: true }
          ]
        })
      ])
      // The store is the truth: an edit goes into it, and the collection of the Grid follows.
      yield* forEachReported("The edits of the Grid", made.edits, (edit) =>
        SubscriptionRef.update(rows, (all) => all.map((one) => (one.id === edit.row ? { ...one, [edit.column]: edit.value } : one))))
      yield* made.edits.pipe(Stream.runForEach((edit) => Effect.sync(() => (log.textContent = `row ${edit.row}, ${edit.column}: ${JSON.stringify(edit.value)}`))), Effect.forkScoped)
    }))
}
