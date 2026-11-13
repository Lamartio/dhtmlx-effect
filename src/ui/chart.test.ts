import { it } from "@effect/vitest"
import { awaitRedraw } from "dhx-suite"
import { Effect, Fiber, Stream, SubscriptionRef } from "effect"
import { expect } from "vitest"
import "dhx-suite/codebase/suite.min.css"
import "../styles.css"
import { Browser, browserWith, setFacts, type BrowserFacts } from "./browser"
import { chart, type ChartConfig } from "./chart"
import { dataCollection } from "./data"
import { alive, Host } from "./host"

const FACTS: BrowserFacts = {
  dark: false,
  locale: "en-GB",
  timeZone: "Europe/Amsterdam",
  viewport: { width: 1200, height: 800 },
  now: new Date("2026-11-08T10:00:00Z")
}

type Month = { readonly id: string; readonly month: string; readonly done: number; readonly color: string }
const MONTHS: ReadonlyArray<Month> = [
  { id: "jan", month: "Jan", done: 14, color: "#5E83BA" },
  { id: "feb", month: "Feb", done: 22, color: "#81C4E8" },
  { id: "mar", month: "Mar", done: 19, color: "#74A2E7" }
]

const BARS: ChartConfig = {
  type: "bar",
  scales: { bottom: { text: "month" }, left: { maxTicks: 8, min: 0, max: 40 } },
  series: [{ id: "done", value: "done", color: "#394E79", fill: "#394E79" }],
  legend: { series: ["done"], halign: "right", valign: "top" }
}

const SLICES: ChartConfig = {
  type: "pie",
  series: [{ value: "done", color: "color", text: "month" }],
  legend: { values: { text: "month", color: "color" }, halign: "right", valign: "top" }
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
  yield* Effect.promise(() => awaitRedraw())
})

const run = <A, E>(body: Effect.Effect<A, E, Host | Browser | import("effect").Scope.Scope>) =>
  Effect.gen(function* () {
    const host = freshHost()
    const facts = yield* browserWith(FACTS)
    yield* Effect.scoped(body.pipe(Effect.provideService(Host, host), Effect.provideService(Browser, facts)))
    expect([...(yield* SubscriptionRef.get(alive))]).toEqual([])
    expect(host.innerHTML).toBe("")
  })

it.live("draws the rows of the store, and follows a change of a row with the same chart", () =>
  run(Effect.gen(function* () {
    const host = yield* Host
    const rows = yield* SubscriptionRef.make(MONTHS)
    const data = yield* dataCollection(rows)
    const made = yield* chart({ data, config: BARS })
    yield* settle
    const drawing = host.querySelector("svg")
    expect(drawing).not.toBeNull()
    expect(host.textContent).toContain("Jan")
    expect(host.textContent).toContain("Mar")
    expect(made.chart.data.getLength()).toBe(3)

    yield* SubscriptionRef.update(rows, (all) => [...all.slice(1), { id: "apr", month: "Apr", done: 31, color: "#C2D2E9" }])
    yield* settle
    expect(made.chart.data.getLength()).toBe(3)
    expect(host.textContent).toContain("Apr")
    expect(host.textContent).not.toContain("Jan")
    expect((yield* SubscriptionRef.get(alive)).get("chart")).toBe(1)
  })))

it.live("changes its type in place when the config in a ref changes", () =>
  run(Effect.gen(function* () {
    const host = yield* Host
    const rows = yield* SubscriptionRef.make(MONTHS)
    const data = yield* dataCollection(rows)
    const config = yield* SubscriptionRef.make(BARS)
    const made = yield* chart({ data, config })
    yield* settle
    expect(made.chart.config.type).toBe("bar")

    yield* SubscriptionRef.set(config, SLICES)
    yield* settle
    expect(made.chart.config.type).toBe("pie")
    expect(host.querySelector("svg")).not.toBeNull()
    expect(host.textContent).toContain("Feb")
    expect((yield* SubscriptionRef.get(alive)).get("chart")).toBe(1)
  })))

it.live("gives a click on a point and a click on the legend as streams", () =>
  run(Effect.gen(function* () {
    const rows = yield* SubscriptionRef.make(MONTHS)
    const data = yield* dataCollection(rows)
    const made = yield* chart({ data, config: BARS })
    yield* settle
    const clicked = yield* made.clicks.pipe(Stream.take(1), Stream.runCollect, Effect.forkScoped)
    const toggled = yield* made.toggled.pipe(Stream.take(1), Stream.runCollect, Effect.forkScoped)
    yield* Effect.yieldNow
    made.chart.events.fire("serieClick" as never, ["done", "feb"] as never)
    made.chart.events.fire("toggleSeries" as never, ["done", undefined] as never)
    expect(yield* Fiber.join(clicked)).toEqual([{ series: "done", row: "feb" }])
    expect(yield* Fiber.join(toggled)).toEqual(["done"])
  })))

it.live("follows the dark mode of the Browser", () =>
  run(Effect.gen(function* () {
    const host = yield* Host
    const browser = yield* Browser
    const rows = yield* SubscriptionRef.make(MONTHS)
    const data = yield* dataCollection(rows)
    yield* chart({ data, config: BARS })
    yield* settle
    expect(host.getAttribute("data-dhx-theme")).toBe("light")
    yield* setFacts(browser, { dark: true })
    yield* settle
    expect(host.getAttribute("data-dhx-theme")).toBe("dark")
  })))
