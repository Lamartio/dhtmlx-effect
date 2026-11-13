import { it } from "@effect/vitest"
import { awaitRedraw } from "dhx-suite"
import { Effect, Fiber, Layer, Option, Queue, Scope, Stream, SubscriptionRef } from "effect"
import { expect } from "vitest"
import "dhx-suite/codebase/suite.min.css"
import "../styles.css"
import "../storybook.css"
import { Browser, browserWith, type BrowserFacts } from "./browser"
import { dataCollection, grid } from "./data"
import { Dialogs, layerDialogsAnswering, layerDialogsLive } from "./dialogs"
import { alive, Host } from "./host"
import { gridContextMenu, menu, openContextMenu, ribbon, type MenuItem } from "./menus"

const FACTS: BrowserFacts = {
  dark: false,
  locale: "en-GB",
  timeZone: "Europe/Amsterdam",
  viewport: { width: 1200, height: 800 },
  now: new Date("2026-11-08T10:00:00Z")
}

const freshHost = () => {
  const element = document.createElement("div")
  element.style.width = "800px"
  element.style.height = "400px"
  document.body.append(element)
  return element
}

const settle = Effect.gen(function* () {
  yield* Effect.yieldNow
  yield* Effect.promise(() => awaitRedraw())
  yield* Effect.yieldNow
})

const run = <A, E>(body: Effect.Effect<A, E, Host | Browser | Scope.Scope>) =>
  Effect.gen(function* () {
    const host = freshHost()
    const browser = yield* browserWith(FACTS)
    yield* Effect.scoped(body.pipe(Effect.provideService(Host, host), Effect.provideService(Browser, browser)))
    yield* settle
    expect([...(yield* SubscriptionRef.get(alive))]).toEqual([])
    expect(document.querySelector(".dhxe-context")).toBeNull()
  })

const ITEMS: ReadonlyArray<MenuItem> = [
  { id: "open", label: "Open" },
  { id: "share", label: "Share" },
  { separator: true },
  { id: "delete", label: "Delete" }
]

const key = (name: string, extra: KeyboardEventInit = {}) => {
  const target = (document.activeElement as HTMLElement | null) ?? document.body
  target.dispatchEvent(new KeyboardEvent("keydown", { key: name, bubbles: true, cancelable: true, ...extra }))
}

const buttonWith = (text: string, root: ParentNode = document) =>
  [...root.querySelectorAll<HTMLElement>(".dhx_menu-button, .dhx_ribbon-button, .dhx_button, button")].find((one) => one.textContent?.trim() === text)

it.live("gives the id of a chosen menu item, and changes the items in place", () =>
  run(Effect.gen(function* () {
    const host = yield* Host
    const items = yield* SubscriptionRef.make<ReadonlyArray<MenuItem>>([{ id: "file", label: "File", items: [{ id: "new", label: "New" }] }, { id: "help", label: "Help" }])
    const { choices } = yield* menu({ items })
    const got = yield* choices.pipe(Stream.take(1), Stream.runCollect, Effect.forkScoped)
    yield* settle
    buttonWith("Help", host)!.click()
    expect(yield* Fiber.join(got)).toEqual(["help"])
    yield* SubscriptionRef.set(items, [{ id: "help", label: "Help and docs" }])
    yield* settle
    expect(host.textContent).toContain("Help and docs")
    expect(host.textContent).not.toContain("File")
  })))

it.live("gives the id of a chosen ribbon button", () =>
  run(Effect.gen(function* () {
    const host = yield* Host
    const { choices } = yield* ribbon({ blocks: [{ title: "Note", items: [{ id: "bold", label: "Bold" }, { id: "link", label: "Link" }] }] })
    const got = yield* choices.pipe(Stream.take(1), Stream.runCollect, Effect.forkScoped)
    yield* settle
    expect(host.textContent).toContain("Note")
    buttonWith("Link", host)!.click()
    expect(yield* Fiber.join(got)).toEqual(["link"])
  })))

it.live("opens a context menu, gives the chosen id, and gives none on Escape", () =>
  run(Effect.gen(function* () {
    const host = yield* Host
    const first = yield* openContextMenu(host, ITEMS).pipe(Effect.forkChild)
    yield* settle
    buttonWith("Share")!.click()
    expect(yield* Fiber.join(first)).toEqual(Option.some("share"))
    const second = yield* openContextMenu(host, ITEMS).pipe(Effect.forkChild)
    yield* settle
    key("Escape")
    expect(yield* Fiber.join(second)).toEqual(Option.none())
  })))

it.live("works on a row of a Grid with the mouse and with the keyboard", () =>
  run(Effect.gen(function* () {
    const host = yield* Host
    const rows = yield* SubscriptionRef.make<ReadonlyArray<{ id: string; title: string }>>([{ id: "075", title: "Frames" }, { id: "076", title: "Data" }])
    const data = yield* dataCollection(rows)
    const table = yield* grid({ data, columns: [{ id: "title", header: "Title" }] })
    const choices = yield* gridContextMenu(table.grid, (row) => [{ id: "open", label: `Open ${row}` }, { id: "delete", label: "Delete" }])
    const got = yield* choices.pipe(Stream.take(2), Stream.runCollect, Effect.forkScoped)
    yield* settle
    // The mouse: a right click on the row of 076.
    const cell = [...host.querySelectorAll<HTMLElement>(".dhx_grid-cell")].find((one) => one.textContent === "Data")!
    cell.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 50, clientY: 80 }))
    yield* settle
    expect(document.querySelector(".dhxe-context")?.textContent).toContain("Open 076")
    buttonWith("Delete")!.click()
    yield* settle
    // The keyboard: Shift+F10 on the selected row, the arrow to the second item, Enter.
    yield* SubscriptionRef.set(table.selected, "075")
    yield* settle
    table.grid.getRootNode().dispatchEvent(new KeyboardEvent("keydown", { key: "F10", shiftKey: true, bubbles: true, cancelable: true }))
    yield* settle
    yield* settle
    expect(document.activeElement?.textContent).toContain("Open 075")
    key("ArrowDown")
    expect(document.activeElement?.textContent).toContain("Delete")
    ;(document.activeElement as HTMLElement).click()
    expect(yield* Fiber.join(got)).toEqual([{ row: "076", choice: "delete" }, { row: "075", choice: "delete" }])
  })))

it.effect("lets a test answer confirm, as the user would", () =>
  Effect.gen(function* () {
    const answers = yield* Queue.unbounded<boolean>()
    const said: Array<string> = []
    const remove = Effect.gen(function* () {
      const dialogs = yield* Dialogs
      const yes = yield* dialogs.confirm({ text: "Delete 076?" })
      if (yes) yield* dialogs.message({ text: "Deleted" })
      return yes
    })
    yield* Queue.offer(answers, false)
    yield* Queue.offer(answers, true)
    const results = yield* Effect.all([remove, remove]).pipe(Effect.provide(layerDialogsAnswering(answers, said)))
    expect(results).toEqual([false, true])
    expect(said).toEqual(["confirm: Delete 076?", "confirm: Delete 076?", "message: Deleted"])
  }))

it.live("gives the answer of the user to a live confirm, and closes it on an interrupt", () =>
  Effect.gen(function* () {
    const dialogs = yield* Effect.service(Dialogs)
    const asked = yield* dialogs.confirm({ text: "Delete 076?", buttons: ["Delete", "Keep"] }).pipe(Effect.forkChild)
    yield* settle
    buttonWith("Delete")!.click()
    expect(yield* Fiber.join(asked)).toBe(true)
    const again = yield* dialogs.confirm({ text: "Delete 077?" }).pipe(Effect.forkChild)
    yield* settle
    expect(document.body.textContent).toContain("Delete 077?")
    yield* Fiber.interrupt(again)
    yield* settle
    expect(document.body.textContent).not.toContain("Delete 077?")
  }).pipe(Effect.provide(layerDialogsLive), Effect.provide(Layer.effect(Browser)(browserWith(FACTS)))))
