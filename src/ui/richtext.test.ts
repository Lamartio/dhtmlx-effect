import { it } from "@effect/vitest"
import { Effect, SubscriptionRef } from "effect"
import { expect } from "vitest"
import { userEvent } from "vitest/browser"
import { text } from "@dhtmlx/richtext"
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
    // The words in the editor, with no marks.
    const words = () => made.richtext.getValue(text.toText)
    yield* settle
    expect(words()).toContain("Hello there")
    // The editor only showed the value: nothing went back.
    expect(yield* SubscriptionRef.get(value)).toBe("<p>Hello there</p>")

    yield* SubscriptionRef.set(value, "<p>A new text</p>")
    yield* settle
    expect(words()).toContain("A new text")
    expect(words()).not.toContain("Hello there")
    expect(host.textContent).not.toBe("")

    // What typing does: the document of the editor changes.
    made.richtext.setValue("<p>Typed by a person</p>")
    yield* settle
    expect(yield* SubscriptionRef.get(value)).toContain("Typed by a person")
    expect((yield* SubscriptionRef.get(alive)).get("richtext")).toBe(1)
  })))

it.live("reads and writes Markdown when the format is markdown", () =>
  run(Effect.gen(function* () {
    const value = yield* SubscriptionRef.make("# A title\n\nSome **bold** words.")
    const made = yield* richtext({ value, format: "markdown" })
    yield* settle
    const words = made.richtext.getValue(text.toText)
    expect(words).toContain("A title")
    expect(words).toContain("bold")
    expect(words).not.toContain("**")

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
    const made = yield* richtext({ value })
    yield* settle
    yield* setFacts(browser, { dark: true })
    yield* settle
    expect(made.richtext.getValue(text.toText)).toContain("Stays here")
    expect(host.textContent).not.toBe("")
    expect(yield* SubscriptionRef.get(value)).toBe("<p>Stays here</p>")
  })))

it.live("is a reader when it is read only: no toolbar, no typing, no edit actions, and a new value still shows", () =>
  run(Effect.gen(function* () {
    const host = yield* Host
    const browser = yield* Browser
    const value = yield* SubscriptionRef.make("<h2>A title</h2><p>Read me</p>")
    const made = yield* richtext({ value, readOnly: true })
    yield* settle
    const area = () => host.querySelector<HTMLElement>("[contenteditable]")
    expect(area()?.getAttribute("contenteditable")).toBe("false")
    expect(host.querySelector(".wx-toolbar")).toBeNull()

    yield* Effect.promise(() => userEvent.click(area()!))
    yield* Effect.promise(() => userEvent.keyboard("Typed"))
    yield* Effect.promise(() => made.richtext.api.exec("set-text-format", { bold: true }))
    yield* Effect.promise(() => made.richtext.api.exec("insert-line", undefined))
    yield* settle
    const words = () => made.richtext.getValue(text.toText)
    expect(words()).not.toContain("Typed")
    expect(made.richtext.getValue()).not.toContain("<strong>")
    expect(made.richtext.getValue()).not.toContain("<hr")
    expect(yield* SubscriptionRef.get(value)).toBe("<h2>A title</h2><p>Read me</p>")

    yield* SubscriptionRef.set(value, "<p>The next note</p>")
    yield* settle
    expect(words()).toContain("The next note")

    // A new theme draws the text area again: it stays read only.
    yield* setFacts(browser, { dark: true })
    yield* settle
    expect(area()?.getAttribute("contenteditable")).toBe("false")
    expect(words()).toContain("The next note")
  })))
