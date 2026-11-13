import { it } from "@effect/vitest"
import { Effect, Fiber, Layer, Stream, SubscriptionRef } from "effect"
import { expect } from "vitest"
import "dhtmlx-scheduler/codebase/dhtmlxscheduler.css"
import "../styles.css"
import "../storybook.css"
import { Browser, browserWith, setFacts, type BrowserFacts } from "./browser"
import { alive, Host, mount } from "./host"
import { fromWall, scheduler, schedulerLanguage, toWall, type CalendarEvent } from "./scheduler"

const FACTS: BrowserFacts = {
  dark: false,
  locale: "en-GB",
  timeZone: "Europe/Amsterdam",
  viewport: { width: 1200, height: 800 },
  now: new Date("2026-11-09T09:00:00Z")
}

const EVENTS: ReadonlyArray<CalendarEvent> = [
  { id: "075", text: "Frames review", start: "2026-11-09T09:00:00Z", end: "2026-11-09T10:00:00Z" },
  { id: "079", text: "Scheduler demo", start: "2026-11-11T13:00:00Z", end: "2026-11-11T14:30:00Z" }
]

const freshHost = () => {
  const element = document.createElement("div")
  element.style.width = "1000px"
  element.style.height = "600px"
  document.body.append(element)
  return element
}

const settle = Effect.gen(function* () {
  yield* Effect.yieldNow
  yield* Effect.sleep(20)
  yield* Effect.yieldNow
})

it("maps a locale to a language of the Scheduler", () => {
  expect(schedulerLanguage("nl-NL")).toBe("nl")
  expect(schedulerLanguage("ja")).toBe("jp")
  expect(schedulerLanguage("x-klingon")).toBe("en")
})

it("puts an instant on the wall clock of a zone, and back", () => {
  const wall = toWall("2026-11-09T09:00:00Z", "America/New_York")
  expect([wall.getHours(), wall.getMinutes()]).toEqual([4, 0])
  expect(fromWall(wall, "America/New_York")).toBe("2026-11-09T09:00:00.000Z")
})

it.live("shows the events of a store in the week of today, and leaves nothing behind", () =>
  Effect.gen(function* () {
    const host = freshHost()
    const events = yield* SubscriptionRef.make(EVENTS)
    const mounted = mount(scheduler({ events }), host, Layer.effect(Browser)(browserWith(FACTS)))
    yield* settle
    expect(host.querySelector(".dhx_cal_container, .dhx_cal_data")).not.toBeNull()
    expect(host.textContent).toContain("Frames review")
    expect(host.textContent).toContain("Scheduler demo")
    expect((yield* SubscriptionRef.get(alive)).get("scheduler")).toBe(1)
    yield* Effect.promise(mounted.dispose)
    expect([...(yield* SubscriptionRef.get(alive))]).toEqual([])
    expect(host.innerHTML).toBe("")
  }))

it.live("follows a change in the store, a drag back into the store, and gives a clicked event", () =>
  Effect.gen(function* () {
    const host = freshHost()
    const facts = yield* browserWith(FACTS)
    yield* Effect.scoped(Effect.gen(function* () {
      const events = yield* SubscriptionRef.make(EVENTS)
      const made = yield* scheduler({ events })
      const clicked = yield* made.opened.pipe(Stream.take(1), Stream.runCollect, Effect.forkScoped)
      yield* settle
      yield* SubscriptionRef.update(events, (all) => [...all.map((one) => (one.id === "075" ? { ...one, text: "Frames done" } : one)), { id: "080", text: "Kanban", start: "2026-11-12T08:00:00Z", end: "2026-11-12T09:00:00Z" }])
      yield* settle
      expect(host.textContent).toContain("Frames done")
      expect(host.textContent).toContain("Kanban")
      // A drag in the Scheduler: the event moves one hour later.
      const shown = made.scheduler.getEvent("079")
      shown.start_date = new Date(shown.start_date.getTime() + 3_600_000)
      shown.end_date = new Date(shown.end_date.getTime() + 3_600_000)
      made.scheduler.updateEvent("079")
      made.scheduler.callEvent("onEventChanged", ["079", shown])
      yield* settle
      expect((yield* SubscriptionRef.get(events)).find((one) => one.id === "079")?.start).toBe("2026-11-11T14:00:00.000Z")
      made.scheduler.callEvent("onClick", ["080", new MouseEvent("click")])
      expect(yield* Fiber.join(clicked)).toEqual(["080"])
    }).pipe(Effect.provideService(Host, host), Effect.provideService(Browser, facts)))
  }))

it.live("follows the time zone, the locale and the view in place", () =>
  Effect.gen(function* () {
    const host = freshHost()
    const facts = yield* browserWith(FACTS)
    yield* Effect.scoped(Effect.gen(function* () {
      const events = yield* SubscriptionRef.make(EVENTS)
      const made = yield* scheduler({ events })
      yield* settle
      // 09:00 UTC is 10:00 in Amsterdam and 04:00 in New York.
      expect(made.scheduler.getEvent("075").start_date.getHours()).toBe(10)
      yield* setFacts(facts, { timeZone: "America/New_York" })
      yield* settle
      expect(made.scheduler.getEvent("075").start_date.getHours()).toBe(4)
      expect(host.textContent).toContain("Frames review")
      yield* setFacts(facts, { locale: "nl-NL", dark: true })
      yield* settle
      expect(made.scheduler.locale.labels.week_tab).toBe("Week")
      expect(made.scheduler.locale.date.month_full[0]?.toLowerCase()).toBe("januari")
      expect(host.getAttribute("data-scheduler-theme")).toBe("dark")
      yield* SubscriptionRef.set(made.view, "month")
      yield* settle
      expect(made.scheduler.getState().mode).toBe("month")
      yield* SubscriptionRef.set(made.date, "2026-12-01")
      yield* settle
      expect(made.scheduler.getState().date.getMonth()).toBe(11)
    }).pipe(Effect.provideService(Host, host), Effect.provideService(Browser, facts)))
    expect([...(yield* SubscriptionRef.get(alive))]).toEqual([])
  }))
