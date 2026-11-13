import { it } from "@effect/vitest"
import { Effect, SubscriptionRef } from "effect"
import { expect } from "vitest"
import "@dhtmlx/richtext/dist/richtext.css"
import { Browser, setFacts } from "./browser"
import { alive, Host } from "./host"
import { richtext } from "./richtext"
import { run, settle } from "./wx-test"

it.live("shows the text of its value, follows a new value, and writes what the user types back", () =>
  run(Effect.gen(function* () {
    const host = yield* Host
    const value = yield* SubscriptionRef.make("<p>Hello there</p>")
    const made = yield* richtext({ value })
    yield* settle
    expect(host.textContent).toContain("Hello there")
    // The editor only showed the value: nothing went back.
    expect(yield* SubscriptionRef.get(value)).toBe("<p>Hello there</p>")

    yield* SubscriptionRef.set(value, "<p>A new text</p>")
    yield* settle
    expect(host.textContent).toContain("A new text")
    expect(host.textContent).not.toContain("Hello there")

    // What typing does: the document of the editor changes.
    made.richtext.setValue("<p>Typed by a person</p>")
    yield* settle
    expect(yield* SubscriptionRef.get(value)).toContain("Typed by a person")
    expect((yield* SubscriptionRef.get(alive)).get("richtext")).toBe(1)
  })))

it.live("reads and writes Markdown when the format is markdown", () =>
  run(Effect.gen(function* () {
    const host = yield* Host
    const value = yield* SubscriptionRef.make("# A title\n\nSome **bold** words.")
    const made = yield* richtext({ value, format: "markdown" })
    yield* settle
    expect(host.textContent).toContain("A title")
    expect(host.textContent).toContain("bold")
    expect(host.textContent).not.toContain("**")

    made.richtext.setValue("<h2>Second</h2><p>More text</p>")
    yield* settle
    const stored = yield* SubscriptionRef.get(value)
    expect(stored).toContain("## Second")
    expect(stored).toContain("More text")
  })))

it.live("keeps its text when the theme of the Browser changes", () =>
  run(Effect.gen(function* () {
    const host = yield* Host
    const browser = yield* Browser
    const value = yield* SubscriptionRef.make("<p>Stays here</p>")
    yield* richtext({ value })
    yield* settle
    yield* setFacts(browser, { dark: true })
    yield* settle
    expect(host.textContent).toContain("Stays here")
    expect(yield* SubscriptionRef.get(value)).toBe("<p>Stays here</p>")
  })))
