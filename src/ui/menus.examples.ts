import type { StoryObj } from "@storybook/html-vite"
import { Effect, Option, Stream, SubscriptionRef } from "effect"
import { button } from "./button"
import { dataCollection, grid } from "./data"
import { Dialogs, layerDialogsLive, tooltipOn } from "./dialogs"
import { column } from "./host"
import { gridContextMenu, menu, openContextMenu, ribbon, type MenuItem } from "./menus"
import { element, inside, widgetStory } from "../storybook/story"

/**
 * The menus and messages: Menu, Ribbon, ContextMenu (also on the rows of a
 * Grid, with the mouse and the keyboard), and confirm, alert, message and tooltip as Effects.
 */
type Story = StoryObj

const say = (log: HTMLElement, line: string) => Effect.sync(() => (log.textContent = `${line}\n${log.textContent ?? ""}`.split("\n").slice(0, 10).join("\n")))

export const MenuBar: Story = {
  name: "Menu",
  render: () =>
    widgetStory(Effect.gen(function* () {
      const locked = yield* SubscriptionRef.make(false)
      const items = (isLocked: boolean): ReadonlyArray<MenuItem> => [
        { id: "file", label: "File", items: [{ id: "new", label: "New note", hotkey: "Ctrl+N" }, { id: "open", label: "Open" }, { separator: true }, { id: "export", label: "Export", items: [{ id: "zip", label: "As a zip" }, { id: "pdf", label: "As a PDF" }] }] },
        { id: "edit", label: "Edit", items: [{ id: "rename", label: "Rename", disabled: isLocked }, { id: "move", label: "Move", disabled: isLocked }] },
        { id: "lock", label: isLocked ? "Unlock" : "Lock" }
      ]
      const ref = yield* SubscriptionRef.make(items(false))
      const bar = yield* element("div")
      const log = yield* element("pre", "dhxe-log", "Choose an item. Lock disables Rename and Move: the items are a SubscriptionRef.")
      const { choices } = yield* inside(bar, menu({ items: ref }))
      yield* choices.pipe(
        Stream.runForEach((id) =>
          Effect.gen(function* () {
            yield* say(log, `chosen: ${id}`)
            if (id === "lock") {
              const next = !(yield* SubscriptionRef.get(locked))
              yield* SubscriptionRef.set(locked, next)
              yield* SubscriptionRef.set(ref, items(next))
            }
          })),
        Effect.forkScoped
      )
    }))
}

export const RibbonBar: Story = {
  name: "Ribbon",
  render: () =>
    widgetStory(Effect.gen(function* () {
      const bar = yield* element("div")
      const log = yield* element("pre", "dhxe-log", "Choose a button.")
      const { choices } = yield* inside(bar, ribbon({
        blocks: [
          { title: "Note", items: [{ id: "new", label: "New", size: "medium" }, { id: "save", label: "Save", size: "medium" }] },
          { title: "Text", items: [{ id: "bold", label: "Bold" }, { id: "italic", label: "Italic" }, { id: "link", label: "Link" }] },
          { title: "Share", items: [{ id: "invite", label: "Invite", size: "medium" }] }
        ]
      }))
      yield* choices.pipe(Stream.runForEach((id) => say(log, `chosen: ${id}`)), Effect.forkScoped)
    }))
}

export const GridRows: Story = {
  name: "Context menu on a Grid",
  render: () =>
    widgetStory(Effect.gen(function* () {
      const rows = yield* SubscriptionRef.make<ReadonlyArray<{ id: string; title: string; status: string }>>([
        { id: "075", title: "Suite/Frames", status: "done" },
        { id: "076", title: "Suite/Data", status: "done" },
        { id: "077", title: "Suite/Forms", status: "done" },
        { id: "078", title: "Suite/Menus and messages", status: "doing" }
      ])
      const data = yield* dataCollection(rows)
      const [log, table] = yield* column([
        Effect.gen(function* () {
          yield* element("p", "dhxe-note", "Right-click a row. Or select a row and press the Menu key or Shift+F10, then the arrows and Enter. Delete asks first.")
          return yield* element("pre", "dhxe-log")
        }),
        grid({ data, columns: [{ id: "id", header: "#", width: 80 }, { id: "title", header: "Title" }, { id: "status", header: "Status", width: 110 }] })
      ])
      const choices = yield* gridContextMenu(table.grid, (row) => [
        { id: "open", label: `Open ${row}` },
        { id: "status", label: "Status", items: ["todo", "doing", "done"].map((status) => ({ id: `status:${status}`, label: status })) },
        { separator: true },
        { id: "delete", label: "Delete" }
      ])
      yield* choices.pipe(
        Stream.runForEach(({ row, choice }) =>
          Effect.gen(function* () {
            const dialogs = yield* Dialogs
            yield* say(log, `${choice} on ${row}`)
            if (choice.startsWith("status:")) yield* SubscriptionRef.update(rows, (all) => all.map((one) => (one.id === row ? { ...one, status: choice.slice(7) } : one)))
            if (choice === "delete" && (yield* dialogs.confirm({ header: "Delete", text: `Delete ${row}?`, buttons: ["Delete", "Keep"] }))) {
              yield* SubscriptionRef.update(rows, (all) => all.filter((one) => one.id !== row))
              yield* dialogs.message({ text: `${row} is deleted`, kind: "success" })
            }
          })),
        Effect.provide(layerDialogsLive),
        Effect.forkScoped
      )
    }))
}

export const Messages: Story = {
  name: "Confirm, alert, message and tooltip",
  render: () =>
    widgetStory(Effect.gen(function* () {
      const row = yield* element("div", "dhxe-row")
      const log = yield* element("pre", "dhxe-log", "Each one is an Effect. Hover or focus the buttons for a tooltip.")
      const ask = yield* inside(row, button({ label: "Confirm" }))
      const tell = yield* inside(row, button({ label: "Alert", color: "secondary" }))
      const note = yield* inside(row, button({ label: "Message", color: "secondary" }))
      const menuAt = yield* inside(row, button({ label: "Context menu here", color: "secondary" }))
      yield* tooltipOn(ask.element, "Asks, and gives the answer back as a boolean")
      yield* tooltipOn(note.element, "Goes after 4 seconds", "top")
      const dialogs = yield* Dialogs
      yield* ask.clicks.pipe(Stream.runForEach(() => dialogs.confirm({ header: "Share", text: "Share this note with Pete?", buttons: ["Share", "Not now"] }).pipe(Effect.flatMap((yes) => say(log, `confirm: ${yes}`)))), Effect.forkScoped)
      yield* tell.clicks.pipe(Stream.runForEach(() => dialogs.alert({ header: "Saved", text: "The note is saved." }).pipe(Effect.andThen(say(log, "alert: closed")))), Effect.forkScoped)
      yield* note.clicks.pipe(Stream.runForEach(() => dialogs.message({ text: "A short message" }).pipe(Effect.andThen(say(log, "message: shown")))), Effect.forkScoped)
      yield* menuAt.clicks.pipe(
        Stream.runForEach(() =>
          openContextMenu(menuAt.element, [{ id: "a", label: "First" }, { id: "b", label: "Second" }]).pipe(
            Effect.flatMap((choice) => say(log, `context menu: ${Option.getOrElse(choice, () => "nothing")}`))
          )),
        Effect.forkScoped
      )
    }).pipe(Effect.provide(layerDialogsLive)))
}
