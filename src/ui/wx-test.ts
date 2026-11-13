import { Effect, Scope, SubscriptionRef } from "effect"
import { expect } from "vitest"
import { Browser, browserWith, type BrowserFacts } from "./browser"
import { alive, Host } from "./host"

// Shared by the tests of the widgets that do not come from the Suite. Not a test file itself.

export const FACTS: BrowserFacts = {
  dark: false,
  locale: "en-GB",
  timeZone: "Europe/Amsterdam",
  viewport: { width: 1200, height: 800 },
  now: new Date("2026-11-08T10:00:00Z")
}

export const freshHost = (width = 1000, height = 600) => {
  const element = document.createElement("div")
  element.style.width = `${width}px`
  element.style.height = `${height}px`
  document.body.append(element)
  return element
}

const frame = Effect.promise(() => new Promise<void>((done) => requestAnimationFrame(() => done())))

/** Waits until the widget drew: these widgets draw in a later task, not in the task of the change. */
export const settle = Effect.gen(function* () {
  yield* Effect.yieldNow
  yield* frame
  yield* Effect.promise(() => new Promise<void>((done) => setTimeout(done, 30)))
  yield* frame
  yield* Effect.yieldNow
})

/** Runs the body with a host and a Browser, and checks that nothing stays behind. */
export const run = <A, E>(body: Effect.Effect<A, E, Host | Browser | Scope.Scope>, facts: BrowserFacts = FACTS) =>
  Effect.gen(function* () {
    const host = freshHost()
    const browser = yield* browserWith(facts)
    yield* Effect.scoped(body.pipe(Effect.provideService(Host, host), Effect.provideService(Browser, browser)))
    expect([...(yield* SubscriptionRef.get(alive))]).toEqual([])
    expect(host.innerHTML).toBe("")
  })
