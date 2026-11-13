import type { Meta, StoryObj } from "@storybook/html-vite"
import { Effect, Stream, SubscriptionRef } from "effect"
import { column } from "./host"
import { kanban } from "./kanban"
import { element, widgetStory } from "../storybook/story"

/**
 * The Kanban: the issues of a tracker in four columns. Drag a card to another column: the status of
 * the issue in the store changes. Click a card: its id shows, where an app would open the issue.
 */
const meta: Meta = { title: "Products/Kanban" }
export default meta
type Story = StoryObj

type Issue = { readonly id: string; readonly title: string; readonly status: string }

const BOARD: ReadonlyArray<Issue> = [
  { id: "004", title: "Pick a folder from a list", status: "backlog" },
  { id: "007", title: "Buy the short domain", status: "backlog" },
  { id: "070", title: "List the widgets that the app needs", status: "backlog" },
  { id: "029", title: "Write the install guide", status: "todo" },
  { id: "067", title: "No silent deaths in a widget tree", status: "todo" },
  { id: "068", title: "Measure the bundle size of one Gantt", status: "todo" },
  { id: "058", title: "Share a page with a guest", status: "doing" },
  { id: "080", title: "Products/Kanban", status: "doing" },
  { id: "075", title: "Frames", status: "done" },
  { id: "076", title: "Data", status: "done" },
  { id: "077", title: "Forms", status: "done" },
  { id: "078", title: "Menus and messages", status: "done" },
  { id: "079", title: "Products/Scheduler", status: "done" }
]

const COLUMNS = [
  { id: "backlog", label: "🪙 BACKLOG" },
  { id: "todo", label: "🔴 TODO" },
  { id: "doing", label: "🟡 DOING" },
  { id: "done", label: "🟢 DONE" }
]

export const Board: Story = {
  render: () =>
    widgetStory(Effect.gen(function* () {
      const rows = yield* SubscriptionRef.make(BOARD)
      const [log, board] = yield* column([
        Effect.gen(function* () {
          yield* element("p", "dhxe-note", "Drag a card to another column: the status in the store changes. Click a card: its id shows here.")
          return yield* element("pre", "dhxe-log")
        }),
        kanban({ rows, field: "status", columns: COLUMNS, label: (row) => `${row.id} ${row.title}` })
      ])
      const say = (line: string) => Effect.sync(() => (log.textContent = `${line}\n${log.textContent ?? ""}`.split("\n").slice(0, 6).join("\n")))
      yield* board.opened.pipe(Stream.runForEach((id) => say(`opened ${id}`)), Effect.forkScoped)
      yield* SubscriptionRef.changes(rows).pipe(
        Stream.zipWithPrevious,
        Stream.runForEach(([before, after]) =>
          Effect.forEach(after, (row) => {
            const was = before._tag === "Some" ? before.value.find((one) => one.id === row.id) : undefined
            return was !== undefined && was.status !== row.status ? say(`store: ${row.id} is now ${row.status}`) : Effect.void
          }, { discard: true })),
        Effect.forkScoped
      )
    }))
}
