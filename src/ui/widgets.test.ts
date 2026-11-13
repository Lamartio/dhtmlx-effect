import { it } from "@effect/vitest"
import { awaitRedraw } from "dhx-suite"
import { Effect, Fiber, Scheduler, Stream, SubscriptionRef } from "effect"
import { expect } from "vitest"
import "dhx-suite/codebase/suite.min.css"
import "dhtmlx-gantt/codebase/dhtmlxgantt.css"
import { Browser, browserWith, follow, layerBrowserFixed, layerBrowserLive, setFacts, type BrowserFacts } from "./browser"
import { button } from "./button"
import { gantt, ganttLanguage, type Task } from "./gantt"
import { liveNow, madeSoFar } from "../core/tally"
import { alive, Host, keyed, mount, uiScheduler } from "./host"
import { messageOf, type ProblemSink, Problems, reportedCallback } from "./problems"
import { planner } from "../examples/planner"
import { toolbar, toolbarButton, toolbarTitle } from "./toolbar"

const FACTS: BrowserFacts = {
  dark: false,
  locale: "en-GB",
  timeZone: "Europe/Amsterdam",
  viewport: { width: 1200, height: 800 },
  now: new Date("2026-11-08T10:00:00Z")
}

const PLAN: ReadonlyArray<Task> = [
  { id: "a", text: "Design", start: "2026-11-02", duration: 4, progress: 1 },
  { id: "b", text: "Build", start: "2026-11-06", duration: 6, progress: 0.4 }
]

/** A host in the page, with a size, as DHTMLX measures it. */
const freshHost = () => {
  const element = document.createElement("div")
  element.style.width = "1000px"
  element.style.height = "500px"
  document.body.append(element)
  return element
}

/** DHTMLX Suite draws on the next frame. */
const redraw = Effect.promise(() => awaitRedraw())
/** A follower runs within the same task, before the browser paints: one yield lets it run. */
const tick = Effect.yieldNow

it("maps a BCP 47 locale to a language of the Gantt, with English when it has none", () => {
  expect(ganttLanguage("nl-NL")).toBe("nl")
  expect(ganttLanguage("ja-JP")).toBe("jp")
  expect(ganttLanguage("zh-Hans-CN")).toBe("cn")
  expect(ganttLanguage("x-klingon")).toBe("en")
})

it.live("gives the clicks of a button as a stream, and follows the dark mode of the browser", () =>
  Effect.gen(function* () {
    const host = freshHost()
    const facts = yield* browserWith(FACTS)
    yield* Effect.scoped(Effect.gen(function* () {
      const { element, clicks } = yield* button({ label: "Save" })
      const seen = yield* clicks.pipe(Stream.take(2), Stream.runCount, Effect.forkScoped)
      yield* tick
      element.click()
      element.click()
      expect(yield* Fiber.join(seen)).toBe(2)
      expect(element.textContent).toBe("Save")
      yield* setFacts(facts, { dark: true })
      yield* tick
      expect(host.getAttribute("data-dhx-theme")).toBe("dark")
    }).pipe(Effect.provideService(Host, host), Effect.provideService(Browser, facts)))
    expect(host.querySelector("button")).toBeNull()
  }))

it.live("adds a toolbar item for the life of its scope, and removes it when the scope closes", () =>
  Effect.gen(function* () {
    const host = freshHost()
    const facts = yield* browserWith(FACTS)
    yield* Effect.scoped(Effect.gen(function* () {
      const inner = yield* toolbar(Effect.gen(function* () {
        yield* toolbarTitle("Plan")
        return yield* Effect.scoped(Effect.gen(function* () {
          yield* toolbarButton({ label: "Only for a moment" })
          yield* redraw
          return host.textContent
        }))
      }))
      yield* redraw
      expect(inner).toContain("Only for a moment")
      expect(host.textContent).toContain("Plan")
      expect(host.textContent).not.toContain("Only for a moment")
    }).pipe(Effect.provideService(Host, host), Effect.provideService(Browser, facts)))
    expect(host.innerHTML).toBe("")
  }))

it.live("leaves nothing alive after a planner is unmounted", () =>
  Effect.gen(function* () {
    const host = freshHost()
    const tasks = yield* SubscriptionRef.make(PLAN)
    const mounted = mount(planner({ title: "Plan", tasks }), host, layerBrowserFixed(FACTS))
    yield* redraw
    const during = yield* SubscriptionRef.get(alive)
    expect(during.get("gantt")).toBe(1)
    expect(during.get("toolbar")).toBe(1)
    expect(host.querySelector(".gantt_container")).not.toBeNull()
    yield* Effect.promise(mounted.dispose)
    expect([...(yield* SubscriptionRef.get(alive))]).toEqual([])
    expect(host.innerHTML).toBe("")
  }))

it.live("adds a task to the plan when the Add task button of the planner is clicked", () =>
  Effect.gen(function* () {
    const host = freshHost()
    const tasks = yield* SubscriptionRef.make(PLAN)
    const mounted = mount(planner({ title: "Plan", tasks }), host, layerBrowserFixed(FACTS))
    yield* redraw
    const add = [...host.querySelectorAll<HTMLElement>("button")].find((item) => item.textContent?.includes("Add task"))
    expect(add).toBeDefined()
    add!.click()
    yield* tick
    const after = yield* SubscriptionRef.get(tasks)
    expect(after.map((task) => task.text)).toEqual(["Design", "Build", "New task 1"])
    expect(after[2]?.start).toBe("2026-11-08")
    expect(host.querySelector(".gantt_grid_data")?.textContent).toContain("New task 1")
    yield* Effect.promise(mounted.dispose)
  }))

it.live("moves the today line and changes the language and the skin of the Gantt in place", () =>
  Effect.gen(function* () {
    const host = freshHost()
    const facts = yield* browserWith(FACTS)
    yield* Effect.scoped(Effect.gen(function* () {
      const tasks = yield* SubscriptionRef.make(PLAN)
      const chart = yield* gantt({ tasks })
      yield* tick
      const line = host.querySelector<HTMLElement>(".dhxe-today")!
      const before = Number.parseFloat(line.style.left)
      expect(line.textContent).toBe("11:00")
      yield* setFacts(facts, { now: new Date("2026-11-09T15:30:00Z"), timeZone: "America/New_York" })
      yield* tick
      expect(Number.parseFloat(line.style.left)).toBeGreaterThan(before)
      expect(line.textContent).toBe("10:30")
      const container = host.querySelector(".gantt_container")
      yield* setFacts(facts, { locale: "nl-NL", dark: true })
      yield* tick
      expect(host.querySelector(".gantt_container")).toBe(container)
      expect(host.getAttribute("data-gantt-theme")).toBe("dark")
      expect(chart.chart.locale.date.month_full[0]).toBe("Januari")
      expect(host.querySelector(".gantt_grid_scale")?.textContent).toContain("Taaknaam")
    }).pipe(Effect.provideService(Host, host), Effect.provideService(Browser, facts)))
  }))

it.live("follows the size of the window in the live Browser layer, and stops when its scope closes", () =>
  Effect.gen(function* () {
    const seen: Array<number> = []
    yield* Effect.scoped(Effect.gen(function* () {
      const browser = yield* Browser
      yield* follow(browser.viewport, (viewport) => seen.push(viewport.width))
      yield* tick
      window.dispatchEvent(new Event("resize"))
      yield* tick
    }).pipe(Effect.provide(layerBrowserLive)))
    window.dispatchEvent(new Event("resize"))
    yield* tick
    expect(seen).toEqual([window.innerWidth, window.innerWidth])
  }))

it.live("changes only the changed task of the Gantt, so the selection and the scroll stay", () =>
  Effect.gen(function* () {
    const host = freshHost()
    const facts = yield* browserWith(FACTS)
    yield* Effect.scoped(Effect.gen(function* () {
      const tasks = yield* SubscriptionRef.make(PLAN)
      const { chart } = yield* gantt({ tasks })
      yield* tick
      let parses = 0
      const parse = chart.parse.bind(chart)
      chart.parse = ((...args: Parameters<typeof parse>) => (parses++, parse(...args))) as typeof parse
      chart.selectTask("a")
      chart.scrollTo(120, null)
      const scroll = chart.getScrollState().x
      yield* SubscriptionRef.update(tasks, (plan) => plan.map((task) => (task.id === "b" ? { ...task, text: "Build it", duration: 8 } : task)))
      yield* tick
      expect(parses).toBe(0)
      expect(chart.getTask("b").text).toBe("Build it")
      expect(chart.getTask("b").duration).toBe(8)
      expect(chart.getSelectedId()).toBe("a")
      expect(chart.getScrollState().x).toBe(scroll)
    }).pipe(Effect.provideService(Host, host), Effect.provideService(Browser, facts)))
  }))

it.live("sends a change in the Gantt back to the plan as one task, and not back again", () =>
  Effect.gen(function* () {
    const host = freshHost()
    const facts = yield* browserWith(FACTS)
    yield* Effect.scoped(Effect.gen(function* () {
      const tasks = yield* SubscriptionRef.make(PLAN)
      const { chart } = yield* gantt({ tasks })
      yield* tick
      let updates = 0
      chart.attachEvent("onAfterTaskUpdate", () => void updates++, {})
      const task = chart.getTask("a")
      task.text = "Design it"
      chart.updateTask("a")
      yield* tick
      expect((yield* SubscriptionRef.get(tasks)).map((one) => one.text)).toEqual(["Design it", "Build"])
      expect(updates).toBe(1)
    }).pipe(Effect.provideService(Host, host), Effect.provideService(Browser, facts)))
  }))

it.live("keeps the toolbar button of each key, and makes or removes only the buttons of new or gone keys", () =>
  Effect.gen(function* () {
    const host = freshHost()
    const facts = yield* browserWith(FACTS)
    yield* Effect.scoped(Effect.gen(function* () {
      const items = yield* SubscriptionRef.make<ReadonlyArray<{ id: string; label: string }>>([{ id: "a", label: "Alpha" }, { id: "b", label: "Beta" }])
      yield* toolbar(keyed(items, (item) => item.id, (item) =>
        Effect.gen(function* () {
          const label = yield* SubscriptionRef.make("")
          yield* follow(item, (value) => Effect.runSync(SubscriptionRef.set(label, value.label)))
          yield* toolbarButton({ label })
        })))
      yield* redraw
      const before = madeSoFar().get("toolbar button") ?? 0
      yield* SubscriptionRef.set(items, [{ id: "a", label: "Alpha" }, { id: "c", label: "Gamma" }, { id: "b", label: "Beta 2" }])
      yield* tick
      yield* redraw
      expect((madeSoFar().get("toolbar button") ?? 0) - before).toBe(1)
      expect(liveNow().get("toolbar button")).toBe(3)
      expect(host.textContent).toContain("Beta 2")
      yield* SubscriptionRef.set(items, [{ id: "c", label: "Gamma" }])
      yield* tick
      yield* redraw
      expect(liveNow().get("toolbar button")).toBe(1)
      expect(host.textContent).not.toContain("Alpha")
    }).pipe(Effect.provideService(Host, host), Effect.provideService(Browser, facts)))
    expect(liveNow().get("toolbar button")).toBeUndefined()
  }).pipe(Effect.provideService(Scheduler.Scheduler, uiScheduler)))

/** A sink that keeps each report: where, and the message. */
const recorder = () => {
  const reports: Array<string> = []
  const sink: ProblemSink = { report: (where, cause) => Effect.sync(() => void reports.push(`${where}: ${messageOf(cause)}`)) }
  return { reports, sink }
}

it.live("a follower that throws is reported with where it was, and the other followers go on", () =>
  Effect.gen(function* () {
    const { reports, sink } = recorder()
    const facts = yield* browserWith(FACTS)
    const seen: Array<string> = []
    yield* Effect.scoped(Effect.gen(function* () {
      yield* follow(facts.locale, (locale) => {
        if (locale === "xx") throw new Error("Incorrect locale information provided")
      }, "The today line")
      yield* follow(facts.locale, (locale) => void seen.push(locale))
      yield* tick
      yield* setFacts(facts, { locale: "xx" })
      yield* tick
      yield* setFacts(facts, { locale: "nl-NL" })
      yield* tick
    }).pipe(Effect.provideService(Problems, sink)))
    expect(reports).toEqual(["The today line: Incorrect locale information provided"])
    expect(seen).toEqual(["en-GB", "xx", "nl-NL"])
  }))

it.live("a throw in a callback that DHTMLX calls is reported, and does not reach DHTMLX", () =>
  Effect.gen(function* () {
    const { reports, sink } = recorder()
    const handler = yield* reportedCallback("The Gantt, on onAfterTaskUpdate", (id: string) => {
      if (id === "bad") throw new Error("The plan is read-only")
      return id.length
    }).pipe(Effect.provideService(Problems, sink))
    expect(handler("ok")).toBe(2)
    expect(() => handler("bad")).not.toThrow()
    expect(handler("bad")).toBeUndefined()
    expect(reports).toEqual(["The Gantt, on onAfterTaskUpdate: The plan is read-only", "The Gantt, on onAfterTaskUpdate: The plan is read-only"])
  }))

it.live("a tree that fails as it starts closes, and the island shows what stopped", () =>
  Effect.gen(function* () {
    const host = freshHost()
    const before = liveNow().get("toolbar") ?? 0
    const broken = Effect.gen(function* () {
      yield* toolbar(toolbarTitle("Plan"))
      return yield* Effect.die(new Error("No data for the plan"))
    })
    const mounted = mount(broken, host, layerBrowserFixed(FACTS))
    yield* redraw
    yield* tick
    expect(liveNow().get("toolbar") ?? 0).toBe(before)
    const bar = host.querySelector(".dhxe-error")
    expect(bar?.getAttribute("role")).toBe("alert")
    expect(bar?.textContent).toBe("The widget stopped: No data for the plan")
    yield* Effect.promise(mounted.dispose)
  }))
