import type { Meta, StoryObj } from "@storybook/html-vite"
import { Effect, Stream, SubscriptionRef } from "effect"
import { element, inside, widgetStory } from "../storybook/story"
import { button } from "./button"
import { datepicker } from "./datepicker"
import { Host } from "./host"

/**
 * The DatePicker alone: an input that opens a Calendar. Change Locale in the toolbar of Storybook:
 * the format of the day in the input follows, and the value stays `YYYY-MM-DD`.
 */
const meta: Meta = { title: "Suite/DatePicker" }
export default meta
type Story = StoryObj

export const Alone: Story = {
  render: () =>
    widgetStory(Effect.gen(function* () {
      const host = yield* Host
      host.classList.add("dhxe-pane")
      const value = yield* SubscriptionRef.make<string | undefined>("2026-11-20")
      const box = yield* element("div", "dhxe-input-box")
      yield* inside(box, datepicker({ value, label: "Due day", placeholder: "Choose a day" }))
      const row = yield* element("div", "dhxe-row")
      const next = yield* inside(row, button({ label: "One week later", color: "secondary" }))
      const none = yield* inside(row, button({ label: "No day", color: "secondary", view: "link" }))
      const out = yield* element("pre", "dhxe-log")
      yield* SubscriptionRef.changes(value).pipe(Stream.runForEach((day) => Effect.sync(() => (out.textContent = `value: ${day ?? "none"}`))), Effect.forkScoped)
      yield* next.clicks.pipe(
        Stream.runForEach(() =>
          SubscriptionRef.update(value, (day) => {
            const date = new Date(`${day ?? "2026-11-20"}T12:00:00Z`)
            date.setUTCDate(date.getUTCDate() + 7)
            return date.toISOString().slice(0, 10)
          })),
        Effect.forkScoped
      )
      yield* none.clicks.pipe(Stream.runForEach(() => SubscriptionRef.set(value, undefined)), Effect.forkScoped)
    }))
}
