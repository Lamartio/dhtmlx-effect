import { it } from "@effect/vitest"
import { Effect, Fiber, Layer, Stream, SubscriptionRef } from "effect"
import { expect } from "vitest"
import "@dhtmlx/kanban/dist/kanban.css"
import "../styles.css"
import "../storybook.css"
import { Browser, browserWith, setFacts, type BrowserFacts } from "./browser"
import { alive, Host, mount } from "./host"
import { kanban, kanbanLanguage, kanbanToolbar } from "./kanban"

const FACTS: BrowserFacts = {
  dark: false,
  locale: "en-GB",
  timeZone: "Europe/Amsterdam",
  viewport: { width: 1200, height: 800 },
  now: new Date("2026-11-09T09:00:00Z")
}

type Issue = { readonly id: string; readonly title: string; readonly status: string }
const ISSUES: ReadonlyArray<Issue> = [
  { id: "075", title: "Frames", status: "done" },
  { id: "078", title: "Menus", status: "doing" },
  { id: "080", title: "Kanban", status: "todo" },
  { id: "007", title: "Buy the domain", status: "backlog" }
]
const COLUMNS = [
  { id: "backlog", label: "🪙 BACKLOG" },
  { id: "todo", label: "🔴 TODO" },
  { id: "doing", label: "🟡 DOING" },
  { id: "done", label: "🟢 DONE" }
]

const freshHost = () => {
  const element = document.createElement("div")
  element.style.width = "1100px"
  element.style.height = "600px"
  document.body.append(element)
  return element
}

const settle = Effect.gen(function* () {
  yield* Effect.yieldNow
  yield* Effect.sleep(30)
  yield* Effect.yieldNow
})

it("maps a locale to a language of the Kanban", () => {
  expect(kanbanLanguage("de-AT")).toBe("de")
  expect(kanbanLanguage("ja-JP")).toBe("jp")
  expect(kanbanLanguage("nl-NL")).toBe("en")
})

it.live("shows the issues in the four columns, and leaves nothing behind", () =>
  Effect.gen(function* () {
    const host = freshHost()
    const rows = yield* SubscriptionRef.make(ISSUES)
    const mounted = mount(kanban({ rows, field: "status", columns: COLUMNS, label: (row) => `${row.id} ${row.title}` }), host, Layer.effect(Browser)(browserWith(FACTS)))
    yield* settle
    for (const column of COLUMNS) expect(host.textContent).toContain(column.label)
    expect(host.textContent).toContain("080 Kanban")
    expect(host.textContent).toContain("007 Buy the domain")
    expect((yield* SubscriptionRef.get(alive)).get("kanban")).toBe(1)
    yield* Effect.promise(mounted.dispose)
    expect([...(yield* SubscriptionRef.get(alive))]).toEqual([])
    expect(host.innerHTML).toBe("")
  }))

it.live("moves a card when the store changes, writes a move back into the store, and gives a clicked card", () =>
  Effect.gen(function* () {
    const host = freshHost()
    const facts = yield* browserWith(FACTS)
    yield* Effect.scoped(Effect.gen(function* () {
      const rows = yield* SubscriptionRef.make(ISSUES)
      const { kanban: board, opened } = yield* kanban({ rows, field: "status", columns: COLUMNS, label: (row) => `${row.id} ${row.title}` })
      const clicked = yield* opened.pipe(Stream.take(1), Stream.runCollect, Effect.forkScoped)
      yield* settle
      // The store moves 080 to doing, and renames 078.
      yield* SubscriptionRef.update(rows, (all) => all.map((one) => (one.id === "080" ? { ...one, status: "doing" } : one.id === "078" ? { ...one, title: "Menus and messages" } : one)))
      yield* settle
      expect((board.getCard("card:080") as unknown as Issue).status).toBe("doing")
      expect(host.textContent).toContain("078 Menus and messages")
      // A drag in the Kanban (the same action as a drop): 007 to todo.
      yield* Effect.promise(() => board.api.exec("move-card", { id: "card:007", columnId: "todo" }))
      yield* settle
      expect((yield* SubscriptionRef.get(rows)).find((one) => one.id === "007")?.status).toBe("todo")
      // A new issue and a removed one.
      yield* SubscriptionRef.update(rows, (all) => [...all.filter((one) => one.id !== "075"), { id: "081", title: "Theme", status: "backlog" }])
      yield* settle
      expect(host.textContent).toContain("081 Theme")
      expect(host.textContent).not.toContain("075 Frames")
      // A click on the card in the page, as the user does: the id comes from the page.
      const card = [...host.querySelectorAll<HTMLElement>("[data-drag-item]")].find((one) => one.textContent?.includes("078 Menus")) ?? [...host.querySelectorAll<HTMLElement>("div")].reverse().find((one) => one.textContent?.trim() === "078 Menus and messages")!
      card.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }))
      card.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }))
      card.click()
      expect(yield* Fiber.join(clicked)).toEqual(["078"])
      yield* setFacts(facts, { dark: true, locale: "de-DE" })
      yield* settle
      expect(host.classList.contains("wx-willow-dark-theme")).toBe(true)
      expect(host.textContent).toContain("081 Theme")
    }).pipe(Effect.provideService(Host, host), Effect.provideService(Browser, facts)))
    expect([...(yield* SubscriptionRef.get(alive))]).toEqual([])
  }))

it.live("keeps the lane of a card and the store the same, shows the fields of a card, and removes its toolbar", () =>
  Effect.gen(function* () {
    const host = freshHost()
    const bar = freshHost()
    const facts = yield* browserWith(FACTS)
    type Task = Issue & { readonly team: string }
    yield* Effect.scoped(Effect.gen(function* () {
      const rows = yield* SubscriptionRef.make<ReadonlyArray<Task>>(ISSUES.map((one) => ({ ...one, team: "app" })))
      const { kanban: board } = yield* kanban({
        rows,
        field: "status",
        columns: COLUMNS.map((one) => (one.id === "doing" ? { ...one, limit: 1, strictLimit: true } : one)),
        lanes: { field: "team", rows: [{ id: "app", label: "The app" }, { id: "site", label: "The site" }] },
        label: (row) => `${row.id} ${row.title}`,
        fields: () => ({ users: ["ann"], progress: 40 }),
        shape: { progress: true, users: { show: true, values: [{ id: "ann", label: "Ann Example" }] } }
      })
      yield* kanbanToolbar(board).pipe(Effect.provideService(Host, bar))
      yield* settle
      expect(host.textContent).toContain("The site")
      expect(host.textContent).toContain("40%")
      expect(bar.querySelector("input")).not.toBeNull()
      expect((board.serialize().columns.find((one) => one.id === "doing"))?.limit).toBe(1)
      // DOING is full (078), so the Kanban refuses 075: the store keeps its status.
      yield* Effect.promise(() => board.api.exec("move-card", { id: "card:075", columnId: "doing", rowId: "app" }))
      yield* settle
      expect((yield* SubscriptionRef.get(rows)).find((one) => one.id === "075")?.status).toBe("done")
      // A drag to the other lane, in the same column.
      yield* Effect.promise(() => board.api.exec("move-card", { id: "card:007", columnId: "backlog", rowId: "site" }))
      yield* settle
      expect((yield* SubscriptionRef.get(rows)).find((one) => one.id === "007")).toMatchObject({ status: "backlog", team: "site" })
      // The store moves 080 to the other lane.
      yield* SubscriptionRef.update(rows, (all) => all.map((one) => (one.id === "080" ? { ...one, team: "site" } : one)))
      yield* settle
      expect((board.getCard("card:080") as unknown as Task).team).toBe("site")
      expect((board.api.getAreaCards("todo", "site") ?? []).map((one) => one.id)).toEqual(["card:080"])
    }).pipe(Effect.provideService(Host, host), Effect.provideService(Browser, facts)))
    expect([...(yield* SubscriptionRef.get(alive))]).toEqual([])
    expect(bar.innerHTML).toBe("")
  }))
