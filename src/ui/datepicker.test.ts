import { it } from "@effect/vitest"
import { awaitRedraw } from "dhx-suite"
import { Effect, Scope, SubscriptionRef } from "effect"
import { expect } from "vitest"
import "dhx-suite/codebase/suite.min.css"
import "../styles.css"
import { Browser, browserWith, setFacts, type BrowserFacts } from "./browser"
import { datepicker } from "./datepicker"
import { alive, Host } from "./host"

const FACTS: BrowserFacts = {
  dark: false,
  locale: "en-GB",
  timeZone: "Europe/Amsterdam",
  viewport: { width: 1200, height: 800 },
  now: new Date("2026-11-08T10:00:00Z")
}

const freshHost = () => {
  const element = document.createElement("div")
  element.style.width = "400px"
  element.style.height = "200px"
  document.body.append(element)
  return element
}

const settle = Effect.gen(function* () {
  yield* Effect.yieldNow
  yield* Effect.promise(() => awaitRedraw())
  yield* Effect.yieldNow
  yield* Effect.promise(() => awaitRedraw())
  yield* Effect.yieldNow
})

const run = <A, E>(body: Effect.Effect<A, E, Host | Browser | Scope.Scope>) =>
  Effect.gen(function* () {
    const host = freshHost()
    const browser = yield* browserWith(FACTS)
    yield* Effect.scoped(body.pipe(Effect.provideService(Host, host), Effect.provideService(Browser, browser)))
    expect([...(yield* SubscriptionRef.get(alive))]).toEqual([])
    expect(host.innerHTML).toBe("")
  })

it.live("shows the day of its value in the format of the locale, and follows a new value and a new locale", () =>
  run(Effect.gen(function* () {
    const host = yield* Host
    const browser = yield* Browser
    const value = yield* SubscriptionRef.make<string | undefined>("2026-11-20")
    yield* datepicker({ value, label: "Due" })
    yield* settle
    const input = () => host.querySelector<HTMLInputElement>("input")!
    expect(input().value).toBe("20/11/2026")
    expect(host.textContent).toContain("Due")

    yield* SubscriptionRef.set(value, "2026-12-03")
    yield* settle
    expect(input().value).toBe("03/12/2026")

    yield* setFacts(browser, { locale: "en-US" })
    yield* settle
    expect(input().value).toBe("12/03/2026")
    expect(yield* SubscriptionRef.get(value)).toBe("2026-12-03")

    yield* SubscriptionRef.set(value, undefined)
    yield* settle
    expect(input().value).toBe("")
  })))

it.live("writes a day that the user picks into its value", () =>
  run(Effect.gen(function* () {
    const value = yield* SubscriptionRef.make<string | undefined>(undefined)
    const made = yield* datepicker({ value })
    yield* settle
    expect(yield* SubscriptionRef.get(value)).toBeUndefined()
    // What a pick in the calendar of the popup does: the control gets a new date.
    ;(made.form.getItem("day") as unknown as { setValue: (date: Date) => void }).setValue(new Date(2026, 11, 24, 12))
    yield* settle
    expect(yield* SubscriptionRef.get(value)).toBe("2026-12-24")
  })))
