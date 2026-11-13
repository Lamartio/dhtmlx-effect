import type { Meta, StoryObj } from "@storybook/html-vite"
import { Effect, Stream, SubscriptionRef } from "effect"
import { button } from "./button"
import { element, inside, widgetStory } from "../storybook/story"

/** The standalone button: the CSS of DHTMLX on a plain button, with its clicks as a stream. */
const meta: Meta = { title: "Button" }
export default meta
type Story = StoryObj

export const Colors: Story = {
  render: () =>
    widgetStory(Effect.gen(function* () {
      const row = yield* element("div", "dhxe-row")
      for (const color of ["primary", "secondary", "success", "danger"] as const) {
        yield* inside(row, button({ label: color, color }))
      }
      yield* inside(row, button({ label: "link", view: "link" }))
      yield* element("p", "dhxe-note", "Switch Theme in the toolbar of Storybook: each button follows Browser.dark, with no remount.")
    }))
}

export const Counter: Story = {
  render: () =>
    widgetStory(Effect.gen(function* () {
      const count = yield* SubscriptionRef.make(0)
      const label = yield* SubscriptionRef.make("Clicked 0 times")
      const locked = yield* SubscriptionRef.make(false)
      const row = yield* element("div", "dhxe-row")
      const counter = yield* inside(row, button({ label }))
      const lock = yield* inside(row, button({ label: "Lock / unlock", color: "secondary" }))
      yield* counter.clicks.pipe(
        Stream.runForEach(() =>
          SubscriptionRef.updateAndGet(count, (n) => n + 1).pipe(Effect.flatMap((n) => SubscriptionRef.set(label, `Clicked ${n} times`)))
        ),
        Effect.forkScoped
      )
      yield* inside(row, button({ label: "Disabled when locked", color: "danger", disabled: locked }))
      yield* lock.clicks.pipe(Stream.runForEach(() => SubscriptionRef.update(locked, (on) => !on)), Effect.forkScoped)
      yield* element("p", "dhxe-note", "The label and the disabled state are SubscriptionRefs: the button follows them.")
    }))
}
