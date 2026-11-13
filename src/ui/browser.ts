import { BrowserStream } from "@effect/platform-browser"
import { Context, Effect, Layer, Stream, SubscriptionRef } from "effect"
import { forEachReported } from "./problems"

export type Viewport = { readonly width: number; readonly height: number }

/** What a widget may want to know about the browser it runs in. Each value can change while it runs. */
export type BrowserFacts = {
  readonly dark: boolean
  /** A BCP 47 tag, like `nl-NL`. */
  readonly locale: string
  /** An IANA zone, like `Europe/Amsterdam`. */
  readonly timeZone: string
  readonly viewport: Viewport
  /** The day and time that the widgets take as now. */
  readonly now: Date
}

/**
 * The facts of the browser, as a service: a widget asks for them, and does not read `window`. The app
 * gives the live layer; Storybook gives a layer from its toolbar; a test gives fixed values. A widget
 * follows `changes` of a value, so it changes in place, with no remount.
 */
export class Browser extends Context.Service<Browser, {
  readonly [K in keyof BrowserFacts]: SubscriptionRef.SubscriptionRef<BrowserFacts[K]>
}>()("dhtmlx-effect/Browser") {}

/** The service with these values. Storybook and tests keep it, to set new values later. */
export const browserWith = (facts: BrowserFacts) =>
  Effect.gen(function* () {
    return {
      dark: yield* SubscriptionRef.make(facts.dark),
      locale: yield* SubscriptionRef.make(facts.locale),
      timeZone: yield* SubscriptionRef.make(facts.timeZone),
      viewport: yield* SubscriptionRef.make(facts.viewport),
      now: yield* SubscriptionRef.make(facts.now)
    } satisfies Browser["Service"]
  })

/** Sets new values on a service from `browserWith`. Values that did not change are left alone. */
export const setFacts = (browser: Browser["Service"], facts: Partial<BrowserFacts>) =>
  Effect.gen(function* () {
    for (const key of Object.keys(facts) as Array<keyof BrowserFacts>) {
      const value = facts[key]
      const ref = browser[key] as SubscriptionRef.SubscriptionRef<unknown>
      if (value !== undefined && JSON.stringify(yield* SubscriptionRef.get(ref)) !== JSON.stringify(value)) yield* SubscriptionRef.set(ref, value)
    }
  })

const viewportNow = (): Viewport => ({ width: window.innerWidth, height: window.innerHeight })

/** Each minute, as a clock on the wall. */
const MINUTE = 60_000

/** The real browser: the colour scheme of the system, the languages, the window and the clock. */
export const layerBrowserLive = Layer.effect(Browser)(
  Effect.gen(function* () {
    const scheme = window.matchMedia("(prefers-color-scheme: dark)")
    const browser = yield* browserWith({
      dark: scheme.matches,
      locale: navigator.language,
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      viewport: viewportNow(),
      now: new Date()
    })
    yield* Effect.acquireRelease(
      Effect.sync(() => {
        const listener = (event: MediaQueryListEvent) => Effect.runSync(SubscriptionRef.set(browser.dark, event.matches))
        scheme.addEventListener("change", listener)
        return listener
      }),
      (listener) => Effect.sync(() => scheme.removeEventListener("change", listener))
    )
    yield* BrowserStream.fromEventListenerWindow("resize").pipe(
      Stream.runForEach(() => SubscriptionRef.set(browser.viewport, viewportNow())),
      Effect.forkScoped
    )
    yield* BrowserStream.fromEventListenerWindow("languagechange").pipe(
      Stream.runForEach(() => SubscriptionRef.set(browser.locale, navigator.language)),
      Effect.forkScoped
    )
    yield* Effect.sync(() => new Date()).pipe(
      Effect.flatMap((date) => SubscriptionRef.set(browser.now, date)),
      Effect.andThen(Effect.sleep(MINUTE)),
      Effect.forever,
      Effect.forkScoped
    )
    return browser
  })
)

/** A layer with fixed values, for a test or a story. */
export const layerBrowserFixed = (facts: BrowserFacts) => Layer.effect(Browser)(browserWith(facts))

/**
 * Runs `f` with each value of `ref`: now, and again on each change, for the life of the scope. A throw
 * in `f` stops the following, so it is logged.
 */
export const follow = <A>(ref: SubscriptionRef.SubscriptionRef<A>, f: (value: A) => void, where = "A part of the widget") =>
  forEachReported(where, SubscriptionRef.changes(ref), (value) => Effect.sync(() => f(value)))
