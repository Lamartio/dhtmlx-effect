import type { Meta, StoryObj } from "@storybook/html-vite"
import { Effect, Stream, SubscriptionRef } from "effect"
import { button } from "./button"
import { alive, column, Host, type Widget } from "./host"
import { layout } from "./layout"
import { openPopup, openWindow } from "./overlay"
import { planner } from "../examples/planner"
import { plan } from "../examples/sample-plan"
import { sidebar } from "./sidebar"
import { element, inside, widgetStory } from "../storybook/story"
import { tabbar } from "./tabbar"
import { toolbar, toolbarButton, toolbarSpacer, toolbarTitle } from "./toolbar"

/**
 * The frames: Layout, Tabbar, Sidebar, Window and Popup. Each one holds parts
 * of the Effect tree; a part that leaves a frame closes its scope, so the counts go back.
 */
const meta: Meta = { title: "Frames" }
export default meta
type Story = StoryObj

/** A short text part, for a cell or a tab. */
const text = (title: string, body: string): Widget =>
  Effect.gen(function* () {
    const host = yield* Host
    host.classList.add("dhxe-pane")
    yield* element("h3", "", title)
    yield* element("p", "dhxe-note", body)
  })

/** The live DHTMLX objects, as the Lifecycle story shows them: a leak shows as a count that stays. */
const counts: Widget = Effect.gen(function* () {
  const out = yield* element("pre", "dhxe-log")
  yield* SubscriptionRef.changes(alive).pipe(
    Stream.runForEach((map) => Effect.sync(() => {
      out.textContent = [...map].sort(([a], [b]) => a.localeCompare(b)).map(([kind, n]) => `${String(n).padStart(3)}  ${kind}`).join("\n")
    })),
    Effect.forkScoped
  )
})

export const Layout: Story = {
  render: () =>
    widgetStory(Effect.gen(function* () {
      const tasks = yield* SubscriptionRef.make(plan())
      yield* layout({
        direction: "cols",
        cells: [
          { id: "side", header: "Notes", width: 240, collapsable: true, resizable: true, part: text("A cell", "Each cell is a part with its own Host. Fold this cell, or drag the line: the planner stays the same object.") },
          {
            id: "main",
            part: layout({
              direction: "rows",
              cells: [
                { id: "plan", header: "Plan", resizable: true, part: planner({ title: "In a layout", tasks }) },
                { id: "live", header: "Live objects", height: 160, part: counts }
              ]
            })
          }
        ]
      })
    }))
}

export const Tabs: Story = {
  render: () =>
    widgetStory(Effect.gen(function* () {
      const tasks = yield* SubscriptionRef.make(plan())
      yield* column([
        tabbar({
          items: [
            { id: "plan", label: "Plan", part: planner({ title: "Plan", tasks }) },
            { id: "about", label: "About", part: text("About", "Only the open tab is mounted. Open Plan and About in turn: the gantt count goes 1, 0, 1 and never grows.") },
            { id: "bar", label: "Toolbar", part: toolbar(Effect.gen(function* () {
              yield* toolbarTitle("A tab with a toolbar")
              yield* toolbarSpacer
              yield* toolbarButton({ label: "Share" })
            })) }
          ]
        }),
        counts
      ], 0)
    }))
}

export const TabsBelow: Story = {
  name: "Tabs below",
  render: () =>
    widgetStory(tabbar({
      mode: "bottom",
      items: [
        { id: "one", label: "One", part: text("One", "The tabs can sit under the parts.") },
        { id: "two", label: "Two", part: text("Two", "A second part.") }
      ]
    }))
}

export const Sidebar: Story = {
  render: () =>
    widgetStory(Effect.gen(function* () {
      const tasks = yield* SubscriptionRef.make(plan())
      yield* column([
        sidebar({
          items: [
            { id: "home", label: "Home", icon: "dxi dxi-file-outline", part: text("Home", "Choose an item. Make the viewport narrower than 720 px: the sidebar folds to its icons.") },
            { id: "plan", label: "Plan", icon: "dxi dxi-calendar", part: planner({ title: "Plan", tasks }) },
            { id: "people", label: "People", icon: "dxi dxi-account-multiple", part: text("People", "Who can open this space.") }
          ]
        }),
        counts
      ], 0)
    }))
}

export const Window: Story = {
  render: () =>
    widgetStory(Effect.gen(function* () {
      const tasks = yield* SubscriptionRef.make(plan())
      const row = yield* element("div", "dhxe-row")
      const log = yield* element("pre", "dhxe-log", "Open a window. Close it with the cross or with Done: its scope ends.")
      const say = (line: string) => Effect.sync(() => (log.textContent = `${line}\n${log.textContent ?? ""}`))
      const open = yield* inside(row, button({ label: "Open a window" }))
      const modal = yield* inside(row, button({ label: "Open a modal", color: "secondary" }))
      yield* counts
      const run = (title: string, isModal: boolean) =>
        openWindow({ title, width: 720, height: 420, modal: isModal }, (close) =>
          column([
            toolbar(Effect.gen(function* () {
              yield* toolbarTitle(title)
              yield* toolbarSpacer
              const done = yield* toolbarButton({ label: "Done", color: "primary" })
              yield* done.pipe(Stream.runForEach(() => close), Effect.forkScoped)
            })),
            planner({ title: "In a window", tasks })
          ])).pipe(Effect.andThen(say(`${title}: closed`)))
      yield* open.clicks.pipe(Stream.runForEach(() => run("A window", false).pipe(Effect.forkScoped)), Effect.forkScoped)
      yield* modal.clicks.pipe(Stream.runForEach(() => run("A modal", true).pipe(Effect.forkScoped)), Effect.forkScoped)
    }))
}

export const Popup: Story = {
  render: () =>
    widgetStory(Effect.gen(function* () {
      const row = yield* element("div", "dhxe-row")
      const log = yield* element("pre", "dhxe-log", "Open the popup. A click outside, or Close, ends it.")
      const open = yield* inside(row, button({ label: "Open a popup" }))
      yield* counts
      yield* open.clicks.pipe(
        Stream.runForEach(() =>
          openPopup(open.element, (close) =>
            Effect.gen(function* () {
              const host = yield* Host
              host.classList.add("dhxe-pane")
              yield* element("p", "", "A part in a popup.")
              const shut = yield* button({ label: "Close", color: "secondary" })
              yield* shut.clicks.pipe(Stream.runForEach(() => close), Effect.forkScoped)
            })).pipe(
            Effect.andThen(Effect.sync(() => (log.textContent = `popup closed\n${log.textContent ?? ""}`))),
            Effect.forkScoped
          )),
        Effect.forkScoped
      )
    }))
}
