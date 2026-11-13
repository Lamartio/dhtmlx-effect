import { it } from "@effect/vitest"
import { awaitRedraw } from "dhx-suite"
import { Effect, Fiber, Layer, Stream, SubscriptionRef } from "effect"
import { expect } from "vitest"
import "dhx-suite/codebase/suite.min.css"
import "dhtmlx-gantt/codebase/dhtmlxgantt.css"
import "../styles.css"
import "../storybook.css"
import { Browser, browserWith, setFacts, type BrowserFacts } from "./browser"
import { button } from "./button"
import { gantt, type Task } from "./gantt"
import { alive, Host, mount } from "./host"
import { layout } from "./layout"
import { openPopup, openWindow } from "./overlay"
import { sidebar } from "./sidebar"
import { element } from "../storybook/story"
import { tabbar } from "./tabbar"
import { toolbar, toolbarTitle } from "./toolbar"

const FACTS: BrowserFacts = {
  dark: false,
  locale: "en-GB",
  timeZone: "Europe/Amsterdam",
  viewport: { width: 1200, height: 800 },
  now: new Date("2026-11-08T10:00:00Z")
}

const PLAN: ReadonlyArray<Task> = [{ id: "a", text: "Design", start: "2026-11-02", duration: 4, progress: 1 }]

const freshHost = () => {
  const element = document.createElement("div")
  element.style.width = "1000px"
  element.style.height = "500px"
  document.body.append(element)
  return element
}

const redraw = Effect.promise(() => awaitRedraw())
const tick = Effect.yieldNow
/** A frame draws, then the slot moves our element into its place: a redraw and a turn. */
const settle = Effect.gen(function* () {
  yield* redraw
  yield* tick
  yield* redraw
})

const text = (kind: string) => Effect.sync(() => document.body.textContent ?? "").pipe(Effect.map((all) => all.includes(kind)))

it.live("puts a toolbar and a Gantt in the cells of a layout, and leaves nothing alive after an unmount", () =>
  Effect.gen(function* () {
    const host = freshHost()
    const tasks = yield* SubscriptionRef.make(PLAN)
    const mounted = mount(
      layout({
        direction: "rows",
        cells: [
          { id: "bar", height: 56, part: toolbar(toolbarTitle("In a cell")) },
          { id: "chart", header: "Plan", part: gantt({ tasks }) }
        ]
      }),
      host,
      Layer.effect(Browser)(browserWith(FACTS))
    )
    yield* settle
    expect(host.querySelector(".dhx_layout")).not.toBeNull()
    const cells = [...host.querySelectorAll<HTMLElement>(".dhx_layout-cell")]
    expect(cells.some((cell) => cell.querySelector(".dhxe-toolbar") !== null)).toBe(true)
    expect(cells.some((cell) => cell.querySelector(".gantt_container") !== null)).toBe(true)
    expect(host.textContent).toContain("In a cell")
    expect(host.querySelector(".gantt_grid_data")?.textContent).toContain("Design")
    const during = yield* SubscriptionRef.get(alive)
    expect(during.get("layout")).toBe(1)
    expect(during.get("gantt")).toBe(1)
    yield* Effect.promise(mounted.dispose)
    expect([...(yield* SubscriptionRef.get(alive))]).toEqual([])
    expect(host.innerHTML).toBe("")
  }))

it.live("keeps the Gantt in its cell when the layout draws the cell again", () =>
  Effect.gen(function* () {
    const host = freshHost()
    const facts = yield* browserWith(FACTS)
    yield* Effect.scoped(Effect.gen(function* () {
      const tasks = yield* SubscriptionRef.make(PLAN)
      const [, chart] = yield* layout({
        direction: "cols",
        cells: [
          { id: "left", width: 200, header: "Left", collapsable: true, part: Effect.void },
          { id: "right", part: gantt({ tasks }) }
        ]
      })
      yield* settle
      const container = host.querySelector(".gantt_container")
      expect(container).not.toBeNull()
      yield* setFacts(facts, { dark: true })
      yield* settle
      expect(host.getAttribute("data-dhx-theme")).toBe("dark")
      expect(host.querySelector(".gantt_container")).toBe(container)
      expect(chart.chart.getTask("a").text).toBe("Design")
    }).pipe(Effect.provideService(Host, host), Effect.provideService(Browser, facts)))
    expect(host.innerHTML).toBe("")
  }))

it.live("mounts only the open tab, and closes the scope of a tab when another opens", () =>
  Effect.gen(function* () {
    const host = freshHost()
    const facts = yield* browserWith(FACTS)
    yield* Effect.scoped(Effect.gen(function* () {
      const tasks = yield* SubscriptionRef.make(PLAN)
      const { active } = yield* tabbar({
        items: [
          { id: "plan", label: "Plan", part: gantt({ tasks }) },
          { id: "notes", label: "Notes", part: toolbar(toolbarTitle("Notes here")) }
        ]
      })
      yield* settle
      expect((yield* SubscriptionRef.get(alive)).get("gantt")).toBe(1)
      expect(host.textContent).not.toContain("Notes here")
      yield* SubscriptionRef.set(active, "notes")
      yield* settle
      expect((yield* SubscriptionRef.get(alive)).get("gantt")).toBeUndefined()
      expect(host.textContent).toContain("Notes here")
      for (let n = 0; n < 5; n++) {
        yield* SubscriptionRef.set(active, n % 2 === 0 ? "plan" : "notes")
        yield* settle
      }
      const live = yield* SubscriptionRef.get(alive)
      expect(live.get("gantt")).toBe(1)
      expect(live.get("toolbar")).toBeUndefined()
      // A click on a tab sets `active`.
      const tab = [...host.querySelectorAll<HTMLElement>(".dhx_tabbar-tab-button")].find((one) => one.textContent?.includes("Notes"))
      expect(tab).toBeDefined()
      tab!.click()
      yield* settle
      expect(yield* SubscriptionRef.get(active)).toBe("notes")
      expect(host.textContent).toContain("Notes here")
    }).pipe(Effect.provideService(Host, host), Effect.provideService(Browser, facts)))
    expect([...(yield* SubscriptionRef.get(alive))]).toEqual([])
    expect(host.innerHTML).toBe("")
  }))

it.live("shows the part of the chosen sidebar item, and folds the sidebar on a narrow window", () =>
  Effect.gen(function* () {
    const host = freshHost()
    const facts = yield* browserWith(FACTS)
    yield* Effect.scoped(Effect.gen(function* () {
      const { active, sidebar: bar } = yield* sidebar({
        items: [
          { id: "home", label: "Home", icon: "dxi dxi-file-outline", part: toolbar(toolbarTitle("Home part")) },
          { id: "plan", label: "Plan", icon: "dxi dxi-calendar", part: toolbar(toolbarTitle("Plan part")) }
        ]
      })
      yield* settle
      expect(host.textContent).toContain("Home part")
      const item = [...host.querySelectorAll<HTMLElement>(".dhx_sidebar-button")].find((one) => one.textContent?.includes("Plan"))
      expect(item).toBeDefined()
      item!.click()
      yield* settle
      expect(yield* SubscriptionRef.get(active)).toBe("plan")
      expect(host.textContent).toContain("Plan part")
      expect(host.textContent).not.toContain("Home part")
      expect(bar.isCollapsed()).toBe(false)
      yield* setFacts(facts, { viewport: { width: 390, height: 800 } })
      yield* settle
      expect(bar.isCollapsed()).toBe(true)
    }).pipe(Effect.provideService(Host, host), Effect.provideService(Browser, facts)))
    expect([...(yield* SubscriptionRef.get(alive))]).toEqual([])
  }))

it.live("ends a window and its part when the part closes it, and when the user clicks the cross", () =>
  Effect.gen(function* () {
    const facts = yield* browserWith(FACTS)
    yield* Effect.gen(function* () {
      // Closed by the part.
      const first = yield* openWindow({ title: "Edit" }, (close) =>
        Effect.gen(function* () {
          const ok = yield* button({ label: "Done" })
          yield* ok.clicks.pipe(Stream.runForEach(() => close), Effect.forkScoped)
        })).pipe(Effect.forkChild)
      yield* settle
      expect(yield* text("Edit")).toBe(true)
      const done = [...document.querySelectorAll<HTMLElement>(".dhx_window button")].find((one) => one.textContent === "Done")
      expect(done).toBeDefined()
      done!.click()
      yield* Fiber.join(first)
      expect(document.querySelector(".dhx_window")).toBeNull()
      expect([...(yield* SubscriptionRef.get(alive))]).toEqual([])
      // Closed by the cross in the header.
      const second = yield* openWindow({ title: "Second" }, () => Effect.void).pipe(Effect.forkChild)
      yield* settle
      const cross = document.querySelector<HTMLElement>(".dhx_window .dhx_window-header button, .dhx_window-header .dhx_button")
      expect(cross).not.toBeNull()
      cross!.click()
      yield* Fiber.join(second)
      expect(document.querySelector(".dhx_window")).toBeNull()
      // Closed from outside: an interrupt.
      const third = yield* openWindow({ title: "Third" }, () => Effect.void).pipe(Effect.forkChild)
      yield* settle
      expect(document.querySelector(".dhx_window")).not.toBeNull()
      yield* Fiber.interrupt(third)
      expect(document.querySelector(".dhx_window")).toBeNull()
      expect([...(yield* SubscriptionRef.get(alive))]).toEqual([])
    }).pipe(Effect.provideService(Browser, facts))
  }))

it.live("shows a popup at its anchor, and ends it on a click outside", () =>
  Effect.gen(function* () {
    const facts = yield* browserWith(FACTS)
    const anchor = freshHost()
    anchor.style.height = "40px"
    const fiber = yield* openPopup(anchor, () => element("p", "", "In a popup")).pipe(Effect.provideService(Browser, facts), Effect.forkChild)
    yield* settle
    expect(document.querySelector(".dhx_popup")?.textContent).toContain("In a popup")
    document.body.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }))
    document.body.dispatchEvent(new MouseEvent("click", { bubbles: true }))
    yield* settle
    yield* Fiber.join(fiber)
    expect(document.querySelector(".dhx_popup")).toBeNull()
    expect([...(yield* SubscriptionRef.get(alive))]).toEqual([])
  }))
