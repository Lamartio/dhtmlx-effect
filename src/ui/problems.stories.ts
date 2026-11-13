import type { Meta, StoryObj } from "@storybook/html-vite"
import { Effect, SubscriptionRef } from "effect"
import { follow } from "./browser"
import { button } from "./button"
import { forEachReported } from "./problems"
import { element, inside, widgetStory } from "../storybook/story"

/**
 * When a part of a widget stops: a red bar at the top of the island says what stopped,
 * and the rest of the widget goes on. The details are in the console.
 */
const meta: Meta = { title: "Problems" }
export default meta
type Story = StoryObj

export const OnePartStops: Story = {
  name: "One part stops, the rest goes on",
  render: () =>
    widgetStory(Effect.gen(function* () {
      const count = yield* SubscriptionRef.make(0)
      const row = yield* element("div", "dhxe-row")
      const plus = yield* inside(row, button({ label: "Count" }))
      const breaks = yield* inside(row, button({ label: "Break the counter", color: "danger" }))
      const out = yield* element("p", "dhxe-note")
      yield* follow(count, (n) => {
        if (n < 0) throw new Error("A count below zero")
        out.textContent = `Count: ${n}`
      }, "The counter")
      yield* forEachReported("The button Count", plus.clicks, () => SubscriptionRef.update(count, (n) => n + 1))
      yield* forEachReported("The button Break", breaks.clicks, () => SubscriptionRef.set(count, -1))
      yield* element("p", "dhxe-note", "Break the counter: the bar says that the counter stopped. Count still works, but the text stays.")
    }))
}

export const CannotStart: Story = {
  name: "The widget cannot start",
  render: () =>
    widgetStory(Effect.gen(function* () {
      yield* element("p", "dhxe-note", "This text goes, as the whole widget closes.")
      return yield* Effect.die(new Error("No data for the plan"))
    }))
}
