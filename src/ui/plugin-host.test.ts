import { it } from "@effect/vitest"
import { awaitRedraw } from "dhx-suite"
import { Effect, Stream, SubscriptionRef } from "effect"
import { expect } from "vitest"
import "dhx-suite/codebase/suite.min.css"
import "@dhtmlx/kanban/dist/kanban.css"
import "@dhtmlx/diagram/codebase/diagram.min.css"
import "@dhtmlx/richtext/dist/richtext.css"
import "@dhtmlx/todolist/dist/todo.css"
import "@dhtmlx/booking/dist/booking.css"
import "@dhtmlx/pivot/dist/pivot.css"
import "@dhtmlx/spreadsheet/codebase/spreadsheet.min.css"
import "@dhtmlx/vault/codebase/vault.min.css"
import "../styles.css"
import { gridModel } from "../model/grid"
import { sliderModel } from "../model/inputs"
import { kanbanModel } from "../model/kanban"
import type { PickedFile, VaultEntry } from "../model/files"
import { type ActionMessage, connectHost, type HostMessage, memoryChannel, type PluginMessage, servePlugin } from "../model/remote"
import { column, gridNode, kanbanNode, publishTree, sliderNode, type UiNode } from "../model/tree"
import { UiState, uiState } from "../model/ui-state"
import { bindTree, Booking, Button, Chart, Column, Diagram, FilePicker, Form, Pivot, VaultNode, RichText, Spreadsheet, Todo, Grid, Kanban, Layout, Menu, Sidebar, Slider, Tabbar, Toolbar } from "../model/nodes"
import { Browser, browserWith } from "./browser"
import { alive, Host } from "./host"
import { renderPlugin } from "./plugin-host"

const FACTS = { dark: false, locale: "en-GB", timeZone: "Europe/Amsterdam", viewport: { width: 1200, height: 800 }, now: new Date("2026-11-17T10:00:00Z") }

const settle = Effect.gen(function* () {
  for (let i = 0; i < 3; i++) {
    yield* Effect.promise(() => new Promise((done) => setTimeout(done, 30)))
    yield* Effect.promise(() => awaitRedraw())
  }
})

type Issue = { readonly id: string; readonly title: string; readonly status: string }
const ISSUES: ReadonlyArray<Issue> = [
  { id: "a", title: "Frames", status: "todo" },
  { id: "b", title: "Data", status: "doing" },
  { id: "c", title: "<img src=x id=injected>", status: "todo" }
]

it.live("draws the tree of a plugin, adds and takes away widgets, and changes a widget in place", () =>
  Effect.gen(function* () {
    const element = document.createElement("div")
    element.style.width = "1000px"
    element.style.height = "700px"
    document.body.append(element)
    const browser = yield* browserWith(FACTS)
    yield* Effect.scoped(Effect.gen(function* () {
      const [pluginEnd, hostEnd] = yield* memoryChannel<HostMessage, PluginMessage>()
      const ui = yield* uiState
      const grid = yield* gridModel({ columns: [{ id: "title", header: "Title" }], rows: ISSUES })
      const kanban = yield* kanbanModel<Issue>({ rows: ISSUES, field: "status", columns: [{ id: "todo", label: "To do" }, { id: "doing", label: "Doing" }] })
      const slider = yield* sliderModel({ value: 4 })
      const nodes = yield* Effect.all({
        grid: gridNode("issues", grid, { columns: [{ id: "title", header: "Title" }], size: 200 }),
        kanban: kanbanNode("board", kanban, { field: "status", columns: [{ id: "todo", label: "To do" }, { id: "doing", label: "Doing" }], labelField: "title" }),
        slider: sliderNode("points", slider, { min: 0, max: 13, size: 80 })
      }).pipe(Effect.provideService(UiState, ui))
      const tree = yield* SubscriptionRef.make<UiNode>(column("main", [nodes.grid, nodes.kanban]))
      yield* publishTree(tree).pipe(Effect.provideService(UiState, ui))
      const page = yield* connectHost(hostEnd)
      yield* servePlugin(ui, pluginEnd)
      yield* renderPlugin(page).pipe(Effect.provideService(Host, element), Effect.provideService(Browser, browser))
      yield* settle
      const count = (kind: string) => Effect.map(SubscriptionRef.get(alive), (live) => live.get(kind) ?? 0)
      expect(yield* count("grid")).toBe(1)
      expect(yield* count("kanban")).toBe(1)
      expect(element.textContent).toContain("Frames")
      // Text from the plugin is text in the page, also in a Grid and on a card.
      expect(element.querySelector("#injected")).toBeNull()
      expect(element.textContent).toContain("<img src=x id=injected>")
      // A change of state in the plugin changes the widget in place: no new Grid.
      yield* grid.sortBy("title", "desc")
      yield* settle
      expect(yield* count("grid")).toBe(1)
      // A new node makes a widget, and a node that goes closes its widget.
      yield* SubscriptionRef.set(tree, column("main", [nodes.grid, nodes.slider]))
      yield* settle
      expect(yield* count("kanban")).toBe(0)
      expect(yield* count("slider")).toBe(1)
      expect(yield* count("grid")).toBe(1)
      // A new config of a node makes that one widget again.
      yield* SubscriptionRef.set(tree, column("main", [{ ...nodes.grid, columns: [{ id: "title", header: "Name" }] }, nodes.slider]))
      yield* settle
      expect(element.querySelector(".dhx_grid-header")?.textContent).toContain("Name")
      expect(yield* count("grid")).toBe(1)
    }))
    expect([...(yield* SubscriptionRef.get(alive))]).toEqual([])
    expect(element.innerHTML).toBe("")
  }))

it.live("draws tabs of a plugin: only the open tab, and a click on a tab goes to the plugin", () =>
  Effect.gen(function* () {
    const element = document.createElement("div")
    element.style.width = "1000px"
    element.style.height = "600px"
    document.body.append(element)
    const browser = yield* browserWith(FACTS)
    yield* Effect.scoped(Effect.gen(function* () {
      const [pluginEnd, hostEnd] = yield* memoryChannel<HostMessage, PluginMessage>()
      const ui = yield* uiState
      const tree = Column.make({
        id: "main",
        children: [Tabbar.make({
          id: "tabs",
          tabs: [
            { label: "Issues", child: Grid.make({ id: "issues", columns: [{ id: "title", header: "Title" }], rows: ISSUES }) },
            { label: "Board", child: Kanban.make({ id: "board", field: "status", labelField: "title", columns: [{ id: "todo", label: "To do" }, { id: "doing", label: "Doing" }], rows: ISSUES }) }
          ]
        })]
      })
      yield* bindTree(tree).pipe(Effect.provideService(UiState, ui))
      const page = yield* connectHost(hostEnd)
      yield* servePlugin(ui, pluginEnd)
      yield* renderPlugin(page).pipe(Effect.provideService(Host, element), Effect.provideService(Browser, browser))
      yield* settle
      const count = (kind: string) => Effect.map(SubscriptionRef.get(alive), (live) => live.get(kind) ?? 0)
      expect(yield* count("grid")).toBe(1)
      expect(yield* count("kanban")).toBe(0)
      // The open tab fills the room under the tabs: the Grid is not 0 px high.
      expect(element.querySelector<HTMLElement>(".dhx_grid")!.getBoundingClientRect().height).toBeGreaterThan(300)
      // A click on the tab Board, as the user does.
      const tab = [...element.querySelectorAll<HTMLElement>(".dhx_tabbar-tab-button, .dhx_tabbar-tab, [role=tab]")].find((one) => one.textContent?.includes("Board"))!
      tab.click()
      yield* settle
      expect(yield* count("kanban")).toBe(1)
      expect(yield* count("grid")).toBe(0)
      expect(((yield* ui.full).state as Record<string, { value?: string }>)["tabs"]?.value).toBe("board")
      // The plugin opens the other tab.
      yield* ui.run("tabs", "set", ["issues"])
      yield* settle
      expect(yield* count("grid")).toBe(1)
      expect(yield* count("kanban")).toBe(0)
    }))
    expect([...(yield* SubscriptionRef.get(alive))]).toEqual([])
    expect(element.innerHTML).toBe("")
  }))

it.live("draws a sidebar and a layout of a plugin: a click on an item goes to the plugin, and the plugin hides a cell", () =>
  Effect.gen(function* () {
    const element = document.createElement("div")
    element.style.width = "1100px"
    element.style.height = "600px"
    document.body.append(element)
    const browser = yield* browserWith(FACTS)
    yield* Effect.scoped(Effect.gen(function* () {
      const [pluginEnd, hostEnd] = yield* memoryChannel<HostMessage, PluginMessage>()
      const ui = yield* uiState
      const tree = Layout.make({
        id: "frame",
        direction: "cols",
        cells: [
          {
            size: 500,
            child: Sidebar.make({
              id: "side",
              items: [
                { label: "Issues", icon: "dxi dxi-table", child: Grid.make({ id: "issues", columns: [{ id: "title", header: "Title" }], rows: ISSUES }) },
                { label: "Points", icon: "dxi dxi-tune", child: Slider.make({ id: "points", value: 3 }) }
              ]
            })
          },
          { header: "Board", child: Kanban.make({ id: "board", field: "status", labelField: "title", columns: [{ id: "todo", label: "To do" }, { id: "doing", label: "Doing" }], rows: ISSUES }) }
        ]
      })
      yield* bindTree(tree).pipe(Effect.provideService(UiState, ui))
      const page = yield* connectHost(hostEnd)
      yield* servePlugin(ui, pluginEnd)
      yield* renderPlugin(page).pipe(Effect.provideService(Host, element), Effect.provideService(Browser, browser))
      yield* settle
      const count = (kind: string) => Effect.map(SubscriptionRef.get(alive), (live) => live.get(kind) ?? 0)
      expect(yield* count("grid")).toBe(1)
      expect(yield* count("kanban")).toBe(1)
      expect(element.querySelector<HTMLElement>(".dhx_grid")!.getBoundingClientRect().height).toBeGreaterThan(300)
      // A click on the item Points of the sidebar, as the user does.
      const item = [...element.querySelectorAll<HTMLElement>(".dhx_nav-menu-button, .dhx_sidebar-button, [role=menuitem], button")].find((one) => one.textContent?.includes("Points"))!
      item.click()
      yield* settle
      expect(((yield* ui.full).state as Record<string, { value?: string }>)["side"]?.value).toBe("points")
      expect(yield* count("grid")).toBe(0)
      expect(yield* count("slider")).toBe(1)
      // The plugin hides the cell of the Kanban.
      yield* ui.run("frame", "hide", ["board"])
      yield* settle
      const boardCell = element.querySelector<HTMLElement>("[data-cell-id=board], .dhx_layout-cell [data-drop-area]")
      expect(boardCell === null || boardCell.offsetParent === null || boardCell.getBoundingClientRect().width === 0).toBe(true)
    }))
    expect([...(yield* SubscriptionRef.get(alive))]).toEqual([])
    expect(element.innerHTML).toBe("")
  }))

it.live("sends a click on a toolbar, a button and a menu of a plugin to the plugin", () =>
  Effect.gen(function* () {
    const element = document.createElement("div")
    element.style.width = "900px"
    element.style.height = "400px"
    document.body.append(element)
    const browser = yield* browserWith(FACTS)
    yield* Effect.scoped(Effect.gen(function* () {
      const [pluginEnd, hostEnd] = yield* memoryChannel<HostMessage, PluginMessage>()
      const ui = yield* uiState
      yield* bindTree(Column.make({
        id: "main",
        children: [
          Toolbar.make({ id: "bar", size: 56, items: [{ title: "Plan" }, { separator: true }, { id: "add", label: "Add" }, { spacer: true }, { id: "help", label: "Help" }] }),
          Button.make({ id: "save", size: 50, label: "Save", color: "primary" }),
          Menu.make({ id: "menu", size: 50, items: [{ id: "file", label: "File", items: [{ id: "open", label: "Open" }] }, { id: "about", label: "About" }] })
        ]
      })).pipe(Effect.provideService(UiState, ui))
      const page = yield* connectHost(hostEnd)
      const log: Array<string> = []
      yield* servePlugin(ui, { ...pluginEnd, messages: pluginEnd.messages.pipe(Stream.tap((message) => Effect.sync(() => message._tag === "action" && void log.push(`${message.id}.${message.action}(${message.args.join(",")})`)))) })
      yield* renderPlugin(page).pipe(Effect.provideService(Host, element), Effect.provideService(Browser, browser))
      yield* settle
      const click = (selector: string, text: string) => [...element.querySelectorAll<HTMLElement>(selector)].find((one) => one.textContent?.trim() === text)!.click()
      click(".dhx_toolbar-button, button", "Add")
      click("button", "Save")
      click(".dhx_menu-button, button", "About")
      yield* settle
      expect(log).toEqual(["bar.click(add)", "save.click(save)", "menu.click(about)"])
    }))
    expect([...(yield* SubscriptionRef.get(alive))]).toEqual([])
  }))

it.live("draws a form of a plugin: a value goes to the plugin, and the error of the plugin shows under its field", () =>
  Effect.gen(function* () {
    const element = document.createElement("div")
    element.style.width = "700px"
    element.style.height = "500px"
    document.body.append(element)
    const browser = yield* browserWith(FACTS)
    yield* Effect.scoped(Effect.gen(function* () {
      const [pluginEnd, hostEnd] = yield* memoryChannel<HostMessage, PluginMessage>()
      const ui = yield* uiState
      yield* bindTree(Column.make({
        id: "main",
        children: [Form.make({ id: "issue", submitLabel: "Save", fields: [{ name: "title", label: "Title", kind: "text", required: true }, { name: "code", label: "Code", kind: "text", pattern: "^[A-Z]{3}$", message: "Three capitals" }] })]
      })).pipe(Effect.provideService(UiState, ui))
      const page = yield* connectHost(hostEnd)
      yield* servePlugin(ui, pluginEnd)
      yield* renderPlugin(page).pipe(Effect.provideService(Host, element), Effect.provideService(Browser, browser))
      yield* settle
      const state = () => Effect.map(ui.full, (full) => (full.state as Record<string, { values: Record<string, unknown>; errors: Record<string, string> }>)["issue"]!)
      // The user types a code, as in the page.
      const code = element.querySelectorAll<HTMLInputElement>("input")[1]!
      code.value = "abc"
      code.dispatchEvent(new Event("input", { bubbles: true }))
      code.dispatchEvent(new Event("change", { bubbles: true }))
      code.dispatchEvent(new Event("blur", { bubbles: true }))
      yield* settle
      expect((yield* state()).values).toEqual({ code: "abc" })
      expect(element.textContent).toContain("Three capitals")
      // A send with no title: the plugin refuses it, and both errors show.
      ;[...element.querySelectorAll<HTMLElement>("button")].find((one) => one.textContent?.includes("Save"))!.click()
      yield* settle
      expect((yield* state()).errors).toEqual({ title: "Fill this in", code: "Three capitals" })
      expect(element.textContent).toContain("Fill this in")
    }))
    expect([...(yield* SubscriptionRef.get(alive))]).toEqual([])
  }))

it.live("draws a chart of a plugin: a click on the legend goes to the plugin, and the plugin hides a series", () =>
  Effect.gen(function* () {
    const element = document.createElement("div")
    element.style.width = "700px"
    element.style.height = "400px"
    document.body.append(element)
    const browser = yield* browserWith(FACTS)
    yield* Effect.scoped(Effect.gen(function* () {
      const [pluginEnd, hostEnd] = yield* memoryChannel<HostMessage, PluginMessage>()
      const ui = yield* uiState
      yield* bindTree(Column.make({
        id: "main",
        children: [Chart.make({
          id: "points",
          config: { type: "bar", series: [{ id: "done", value: "done", color: "#2e7dd1" }, { id: "open", value: "open", color: "#e0a030" }], scales: { bottom: { text: "month" }, left: {} }, legend: { series: ["done", "open"], halign: "right", valign: "top" } },
          rows: [{ id: "jan", month: "Jan", done: 3, open: 4 }, { id: "feb", month: "Feb", done: 5, open: 2 }]
        })]
      })).pipe(Effect.provideService(UiState, ui))
      const page = yield* connectHost(hostEnd)
      yield* servePlugin(ui, pluginEnd)
      yield* renderPlugin(page).pipe(Effect.provideService(Host, element), Effect.provideService(Browser, browser))
      yield* settle
      const hidden = () => Effect.map(ui.full, (full) => (full.state as Record<string, { hidden: ReadonlyArray<string> }>)["points"]!.hidden)
      // A click on the legend item of done, as the user does: it goes to the plugin.
      const drawn = () => element.querySelector(".dhx_chart")?.innerHTML ?? element.innerHTML
      const first = drawn()
      ;[...element.querySelectorAll<Element>(".legend-item")].find((one) => one.textContent?.includes("done"))!.dispatchEvent(new MouseEvent("click", { bubbles: true }))
      yield* settle
      expect(yield* hidden()).toEqual(["done"])
      // The plugin shows done again, and hides open: the Chart in the page follows.
      yield* ui.run("points", "toggle", ["done"])
      yield* ui.run("points", "toggle", ["open"])
      yield* settle
      expect(yield* hidden()).toEqual(["open"])
      expect(drawn()).not.toBe(first)
    }))
    expect([...(yield* SubscriptionRef.get(alive))]).toEqual([])
  }))

it.live("draws a diagram of a plugin, and an edit in the plugin shows in the page", () =>
  Effect.gen(function* () {
    const element = document.createElement("div")
    element.style.width = "800px"
    element.style.height = "500px"
    document.body.append(element)
    const browser = yield* browserWith(FACTS)
    yield* Effect.scoped(Effect.gen(function* () {
      const [pluginEnd, hostEnd] = yield* memoryChannel<HostMessage, PluginMessage>()
      const ui = yield* uiState
      yield* bindTree(Column.make({
        id: "main",
        children: [Diagram.make({ id: "flow", items: [{ id: "plan", type: "rectangle", text: "Plan", x: 40, y: 40 }, { id: "work", type: "rectangle", text: "Work", x: 280, y: 40 }, { id: "line", type: "line", from: "plan", to: "work" }] })]
      })).pipe(Effect.provideService(UiState, ui))
      const page = yield* connectHost(hostEnd)
      yield* servePlugin(ui, pluginEnd)
      yield* renderPlugin(page).pipe(Effect.provideService(Host, element), Effect.provideService(Browser, browser))
      yield* settle
      expect(element.textContent).toContain("Plan")
      expect(element.textContent).toContain("Work")
      // The plugin selects a shape, and changes the items.
      expect(yield* ui.run("flow", "select", ["work"])).toBe(true)
      expect(yield* ui.run("flow", "edit", [[{ id: "plan", type: "rectangle", text: "Plan it", x: 40, y: 40 }]])).toBe(true)
      expect(yield* ui.run("flow", "edit", [[{ id: "line", type: "line", from: "plan", to: "nothing" }]])).toBe(false)
      yield* settle
      expect(element.textContent).toContain("Plan it")
      expect(element.textContent).not.toContain("Work")
    }))
    expect([...(yield* SubscriptionRef.get(alive))]).toEqual([])
  }))

it.live("draws a rich text and a to do list of a plugin, and a change in the plugin shows in the page", () =>
  Effect.gen(function* () {
    const element = document.createElement("div")
    element.style.width = "800px"
    element.style.height = "600px"
    document.body.append(element)
    const browser = yield* browserWith(FACTS)
    yield* Effect.scoped(Effect.gen(function* () {
      const [pluginEnd, hostEnd] = yield* memoryChannel<HostMessage, PluginMessage>()
      const ui = yield* uiState
      yield* bindTree(Column.make({
        id: "main",
        children: [
          RichText.make({ id: "notes", format: "markdown", value: "First **notes**" }),
          Todo.make({ id: "tasks", data: { tasks: [{ id: "plan", text: "Plan the week" }] } })
        ]
      })).pipe(Effect.provideService(UiState, ui))
      const page = yield* connectHost(hostEnd)
      yield* servePlugin(ui, pluginEnd)
      yield* renderPlugin(page).pipe(Effect.provideService(Host, element), Effect.provideService(Browser, browser))
      yield* settle
      expect(element.textContent).toContain("First notes")
      expect(element.textContent).toContain("Plan the week")
      expect(yield* ui.run("notes", "set", ["Other notes"])).toBe(true)
      expect(yield* ui.run("tasks", "edit", [{ tasks: [{ id: "ship", text: "Ship it" }] }])).toBe(true)
      expect(yield* ui.run("tasks", "edit", [{ tasks: [{ id: "x", text: "X", parent: "nothing" }] }])).toBe(false)
      yield* settle
      expect(element.textContent).toContain("Other notes")
      expect(element.textContent).toContain("Ship it")
      expect(element.textContent).not.toContain("Plan the week")
    }))
    expect([...(yield* SubscriptionRef.get(alive))]).toEqual([])
  }))

it.live("draws a booking, a pivot and a spreadsheet of a plugin, and a change in the plugin shows in the page", () =>
  Effect.gen(function* () {
    const element = document.createElement("div")
    element.style.width = "1000px"
    element.style.height = "1200px"
    document.body.append(element)
    const browser = yield* browserWith(FACTS)
    yield* Effect.scoped(Effect.gen(function* () {
      const [pluginEnd, hostEnd] = yield* memoryChannel<HostMessage, PluginMessage>()
      const ui = yield* uiState
      yield* bindTree(Column.make({
        id: "main",
        children: [
          Booking.make({ id: "rooms", size: 400, cards: [{ id: "blue", title: "Blue room", slots: [{ from: 9, to: 17 }] }] }),
          Pivot.make({
            id: "hours",
            size: 400,
            fields: [{ id: "team", type: "text" }, { id: "hours", type: "number" }],
            rows: [{ id: "1", team: "North", hours: 5 }, { id: "2", team: "South", hours: 7 }],
            config: { rows: ["team"], values: [{ field: "hours", method: "sum" }] }
          }),
          Spreadsheet.make({ id: "sheet", data: [{ cell: "A1", value: "Apples" }] })
        ]
      })).pipe(Effect.provideService(UiState, ui))
      const page = yield* connectHost(hostEnd)
      yield* servePlugin(ui, pluginEnd)
      yield* renderPlugin(page).pipe(Effect.provideService(Host, element), Effect.provideService(Browser, browser))
      yield* settle
      expect(element.textContent).toContain("Blue room")
      expect(element.textContent).toContain("North")
      expect(element.textContent).toContain("Apples")
      expect(yield* ui.run("rooms", "book", ["red", 0, 30, {}])).toBe(false)
      expect(yield* ui.run("hours", "configure", [{ rows: ["nothing"] }])).toBe(false)
      expect(yield* ui.run("sheet", "edit", [[{ cell: "A1", value: "Plums" }]])).toBe(true)
      yield* settle
      expect(element.textContent).toContain("Plums")
    }))
    expect([...(yield* SubscriptionRef.get(alive))]).toEqual([])
  }))

/** Gives `files` to an `<input type="file">`, as the file dialog does. */
const choose = (field: HTMLInputElement, files: ReadonlyArray<File>) => {
  const transfer = new DataTransfer()
  for (const file of files) transfer.items.add(file)
  field.files = transfer.files
  field.dispatchEvent(new Event("change", { bubbles: true }))
}

it.live("sends a file of a vault and of a file picker to the plugin with its bytes, and refuses one that is too large", () =>
  Effect.gen(function* () {
    const element = document.createElement("div")
    element.style.width = "800px"
    element.style.height = "600px"
    document.body.append(element)
    const browser = yield* browserWith(FACTS)
    yield* Effect.scoped(Effect.gen(function* () {
      const [pluginEnd, hostEnd] = yield* memoryChannel<HostMessage, PluginMessage>()
      const sent: Array<ActionMessage> = []
      const tapped = { ...pluginEnd, messages: pluginEnd.messages.pipe(Stream.tap((message) => Effect.sync(() => message._tag === "action" && sent.push(message)))) }
      const ui = yield* uiState
      yield* bindTree(Column.make({
        id: "main",
        children: [FilePicker.make({ id: "picker", size: 60, label: "Pick", maxSize: 10 }), VaultNode.make({ id: "box", maxSize: 10 })]
      })).pipe(Effect.provideService(UiState, ui))
      const page = yield* connectHost(hostEnd)
      yield* servePlugin(ui, tapped)
      yield* renderPlugin(page).pipe(Effect.provideService(Host, element), Effect.provideService(Browser, browser))
      yield* settle
      choose(element.querySelector<HTMLInputElement>("input[type=file]")!, [new File(["hello"], "hello.txt", { type: "text/plain" })])
      // The Vault takes a drop of files. The entries of a made DataTransfer are empty, so the drop gives the files only.
      const drop = new DataTransfer()
      for (const file of [new File(["notes"], "notes.md"), new File(["much too long"], "big.txt")]) drop.items.add(file)
      const area = element.querySelector(".dhx_vault")!
      for (const type of ["dragenter", "drop"]) {
        const event = new Event(type, { bubbles: true, cancelable: true })
        Object.defineProperty(event, "dataTransfer", { value: { types: ["Files"], files: drop.files } })
        area.dispatchEvent(event)
      }
      yield* Effect.sleep("300 millis")
      yield* settle
      const pick = sent.find((message) => message.action === "pick")?.args[0] as PickedFile
      expect(pick.name).toBe("hello.txt")
      expect(new TextDecoder().decode(pick.bytes)).toBe("hello")
      const state = (yield* ui.full).state as { readonly box: { readonly files: ReadonlyArray<VaultEntry> } }
      expect(state.box.files.map((file) => file.name)).toEqual(["notes.md"])
      // The large file is refused, and goes out of the Vault.
      expect(element.textContent).toContain("notes.md")
      expect(element.textContent).not.toContain("big.txt")
    }))
    expect([...(yield* SubscriptionRef.get(alive))]).toEqual([])
  }))
