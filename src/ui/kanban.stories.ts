import type { Meta, StoryObj } from "@storybook/html-vite"
import { Effect, Stream, SubscriptionRef } from "effect"
import { button } from "./button"
import { column } from "./host"
import { kanban, kanbanToolbar, type KanbanShape } from "./kanban"
import { element, inside, widgetStory } from "../storybook/story"

/**
 * The Kanban: the issues of a tracker in four columns. Drag a card to another column: the status of
 * the issue in the store changes. Click a card: its id shows, where an app would open the issue.
 */
const meta: Meta = { title: "Products/Kanban" }
export default meta
type Story = StoryObj

type Issue = {
  readonly id: string
  readonly title: string
  readonly status: string
  readonly team: string
  readonly about: string
  readonly priority: string
  readonly owners: ReadonlyArray<string>
  readonly progress: number
  readonly colour: string
}

const issue = (id: string, title: string, status: string, team: string, priority: string, owners: ReadonlyArray<string>, progress: number, about: string): Issue => ({
  id, title, status, team, priority, owners, progress, about,
  colour: team === "app" ? "#3b82f6" : "#a855f7"
})

const BOARD: ReadonlyArray<Issue> = [
  issue("004", "Pick a folder from a list", "backlog", "app", "low", ["ann"], 0, "A list in the chat, and the app follows."),
  issue("007", "Buy the short domain", "backlog", "site", "low", ["bo"], 0, "Four letters, if the price is right."),
  issue("070", "List the widgets that the app needs", "backlog", "app", "medium", ["ann", "cy"], 10, "One row for each part of the app."),
  issue("029", "Write the install guide", "todo", "site", "high", ["bo"], 0, "From a new account to the first note."),
  issue("067", "No silent deaths in a widget tree", "todo", "app", "high", ["cy"], 20, "An error shows, and the other parts go on."),
  issue("068", "Measure the bundle size of one Gantt", "todo", "app", "medium", ["ann"], 0, "Gzipped, with and without the Suite."),
  issue("058", "Share a page with a guest", "doing", "app", "high", ["ann", "bo", "cy"], 60, "By link, for reading only."),
  issue("080", "Products/Kanban", "doing", "app", "medium", ["cy"], 80, "This board."),
  issue("075", "Frames", "done", "app", "medium", ["ann"], 100, "Layout, Tabbar, Sidebar, Window."),
  issue("076", "Data", "done", "app", "medium", ["cy"], 100, "Grid, Tree, List, DataView."),
  issue("077", "Forms", "done", "app", "low", ["ann"], 100, "A form from a Schema."),
  issue("078", "Menus and messages", "done", "app", "low", ["bo"], 100, "Menu, Ribbon, Message, Popup."),
  issue("079", "Products/Scheduler", "done", "site", "medium", ["bo", "cy"], 100, "A week of events.")
]

const COLUMNS = [
  { id: "backlog", label: "🪙 BACKLOG" },
  { id: "todo", label: "🔴 TODO" },
  { id: "doing", label: "🟡 DOING" },
  { id: "done", label: "🟢 DONE" }
]

const LANES = [
  { id: "app", label: "The app" },
  { id: "site", label: "The site" }
]

const label = (row: Issue) => `${row.id} ${row.title}`

/** A line of help and a log above the board. */
const notes = (text: string) =>
  Effect.gen(function* () {
    yield* element("p", "dhxe-note", text)
    const log = yield* element("pre", "dhxe-log")
    return (line: string) => Effect.sync(() => (log.textContent = `${line}\n${log.textContent ?? ""}`.split("\n").slice(0, 6).join("\n")))
  })

/** Says each row whose `field` changed in the store. */
const sayChanges = (rows: SubscriptionRef.SubscriptionRef<ReadonlyArray<Issue>>, field: "status" | "team", say: (line: string) => Effect.Effect<void>) =>
  SubscriptionRef.changes(rows).pipe(
    Stream.zipWithPrevious,
    Stream.runForEach(([before, after]) =>
      Effect.forEach(after, (row) => {
        const was = before._tag === "Some" ? before.value.find((one) => one.id === row.id) : undefined
        return was !== undefined && was[field] !== row[field] ? say(`store: ${row.id} is now ${row[field]}`) : Effect.void
      }, { discard: true })),
    Effect.forkScoped
  )

export const Board: Story = {
  render: () =>
    widgetStory(Effect.gen(function* () {
      const rows = yield* SubscriptionRef.make(BOARD)
      const [say, board] = yield* column([
        notes("Drag a card to another column: the status in the store changes. Click a card: its id shows here."),
        kanban({ rows, field: "status", columns: COLUMNS, label })
      ])
      yield* board.opened.pipe(Stream.runForEach((id) => say(`opened ${id}`)), Effect.forkScoped)
      yield* sayChanges(rows, "status", say)
    }))
}

/** The store is the truth: a new row, a new status and a removed row come from the code, and the board follows in place. */
export const FromTheStore: Story = {
  name: "Changes from the store",
  render: () =>
    widgetStory(Effect.gen(function* () {
      const rows = yield* SubscriptionRef.make(BOARD)
      const [bar] = yield* column([
        Effect.gen(function* () {
          const row = yield* element("div", "dhxe-row")
          const add = yield* inside(row, button({ label: "Add an issue", color: "secondary" }))
          const next = yield* inside(row, button({ label: "Move the first card of TODO to DOING" }))
          const remove = yield* inside(row, button({ label: "Remove the last card of DONE" }))
          return { add, next, remove }
        }),
        kanban({ rows, field: "status", columns: COLUMNS, label })
      ])
      let n = 0
      yield* bar.add.clicks.pipe(
        Stream.runForEach(() => SubscriptionRef.update(rows, (all) => [...all, issue(`9${++n}`, `Issue ${n} from the code`, "backlog", "app", "low", [], 0, "")])),
        Effect.forkScoped
      )
      yield* bar.next.clicks.pipe(
        Stream.runForEach(() => SubscriptionRef.update(rows, (all) => {
          const first = all.find((one) => one.status === "todo")
          return all.map((one) => (one === first ? { ...one, status: "doing" } : one))
        })),
        Effect.forkScoped
      )
      yield* bar.remove.clicks.pipe(
        Stream.runForEach(() => SubscriptionRef.update(rows, (all) => {
          const last = all.findLast((one) => one.status === "done")
          return all.filter((one) => one !== last)
        })),
        Effect.forkScoped
      )
    }))
}

const PEOPLE = [
  { id: "ann", label: "Ann" },
  { id: "bo", label: "Bo" },
  { id: "cy", label: "Cy" }
]

const SHAPE: KanbanShape = {
  color: true,
  progress: true,
  start_date: true,
  end_date: true,
  users: { show: true, values: PEOPLE },
  priority: {
    show: true,
    values: [
      { id: "high", color: "#ef4444", label: "High" },
      { id: "medium", color: "#f59e0b", label: "Medium" },
      { id: "low", color: "#22c55e", label: "Low" }
    ]
  }
}

/** The fields of a card for `SHAPE`. Each issue takes two weeks, one after the other. */
const fields = (row: Issue) => {
  const start = new Date(Date.UTC(2026, 10, 2 + (Number(row.id) % 4) * 7))
  return {
    color: row.colour,
    priority: row.priority,
    progress: row.progress,
    users: [...row.owners],
    start_date: start,
    end_date: new Date(start.getTime() + 13 * 86_400_000)
  }
}

/** A card with all its fields: a second line, a colour, a priority, the progress, the dates and the people. */
export const Cards: Story = {
  name: "Card fields",
  render: () =>
    widgetStory(Effect.gen(function* () {
      const rows = yield* SubscriptionRef.make(BOARD)
      yield* kanban({ rows, field: "status", columns: COLUMNS, label, description: (row) => row.about, fields, shape: SHAPE })
    }))
}

/** A lane for each team. A drag to the other lane changes the team of the issue in the store. Click the name of a lane to fold it. */
export const Swimlanes: Story = {
  render: () =>
    widgetStory(Effect.gen(function* () {
      const rows = yield* SubscriptionRef.make(BOARD)
      const [say] = yield* column([
        notes("Drag a card to the other lane: the team in the store changes. A drag to another column changes the status, as before."),
        kanban({ rows, field: "status", columns: COLUMNS, lanes: { field: "team", rows: LANES }, label })
      ])
      yield* sayChanges(rows, "status", say)
      yield* sayChanges(rows, "team", say)
    }))
}

/** TODO takes five cards and marks when it has more. DOING takes two, and refuses a third. DONE starts folded: click its arrow to open it. */
export const Limits: Story = {
  name: "Limits and a folded column",
  render: () =>
    widgetStory(Effect.gen(function* () {
      const rows = yield* SubscriptionRef.make(BOARD)
      const [say] = yield* column([
        notes("DOING is full: a drag into it is refused, and the store keeps the status. Drag three cards to TODO: it goes over its limit."),
        kanban({
          rows,
          field: "status",
          label,
          columns: [
            { id: "backlog", label: "🪙 BACKLOG" },
            { id: "todo", label: "🔴 TODO", limit: 5 },
            { id: "doing", label: "🟡 DOING", limit: 2, strictLimit: true },
            { id: "done", label: "🟢 DONE", collapsed: true }
          ]
        })
      ])
      yield* sayChanges(rows, "status", say)
    }))
}

/** The toolbar of the Kanban: the search dims the cards that do not match, and the sort orders the cards in each column. The store does not change. */
export const SearchAndSort: Story = {
  name: "Search and sort",
  render: () =>
    widgetStory(Effect.gen(function* () {
      const rows = yield* SubscriptionRef.make(BOARD)
      // The toolbar is above the board, but it needs the board: so its place comes first, and the toolbar after.
      const [place, board] = yield* column([element("div"), kanban({ rows, field: "status", columns: COLUMNS, label, description: (row) => row.about })])
      yield* inside(place, kanbanToolbar(board.kanban))
    }))
}
