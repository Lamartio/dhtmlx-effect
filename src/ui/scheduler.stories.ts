import type { Meta, StoryObj } from "@storybook/html-vite"
import { Effect, Stream, SubscriptionRef } from "effect"
import { zoned } from "../core/form"
import { Browser } from "./browser"
import { column } from "./host"
import { scheduler, type CalendarEvent, type SchedulerView } from "./scheduler"
import { element, widgetStory } from "../storybook/story"

/**
 * The Scheduler: a week of events. Change Locale, Zone and
 * Theme in the toolbar of Storybook: the Scheduler follows in place. A click on an event gives its id.
 */
const meta: Meta = { title: "Products/Scheduler" }
export default meta
type Story = StoryObj

/** Events in the week of now, at whole hours in UTC. */
const week = (now: Date): ReadonlyArray<CalendarEvent> => {
  const at = (days: number, hour: number, hours: number) => {
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + days, hour))
    return { start: start.toISOString(), end: new Date(start.getTime() + hours * 3_600_000).toISOString() }
  }
  return [
    { id: "075", text: "075 Frames review", ...at(0, 9, 1) },
    { id: "076", text: "076 Data demo", ...at(1, 13, 1.5) },
    { id: "077", text: "077 Forms", ...at(2, 8, 3) },
    { id: "079", text: "079 Scheduler", ...at(3, 14, 2) },
    { id: "080", text: "080 Kanban licence", ...at(-1, 10, 1) }
  ]
}

export const Week: Story = {
  render: () =>
    widgetStory(Effect.gen(function* () {
      const browser = yield* Browser
      const now = yield* SubscriptionRef.get(browser.now)
      const events = yield* SubscriptionRef.make(week(now))
      const [log, made] = yield* column([
        Effect.gen(function* () {
          yield* element("p", "dhxe-note", "Drag or resize an event: the store changes. Click an event: its id shows below, where an app would open it.")
          return yield* element("pre", "dhxe-log")
        }),
        scheduler({ events })
      ])
      yield* made.opened.pipe(Stream.runForEach((id) => Effect.sync(() => (log.textContent = `opened ${id}\n${log.textContent ?? ""}`))), Effect.forkScoped)
      yield* SubscriptionRef.changes(events).pipe(
        Stream.drop(1),
        Stream.runForEach((all) =>
          Effect.gen(function* () {
            const zone = yield* SubscriptionRef.get(browser.timeZone)
            log.textContent = `store: ${all.map((one) => `${one.id} ${zoned(new Date(one.start), zone).time}`).join(", ")}\n${log.textContent ?? ""}`
          })),
        Effect.forkScoped
      )
    }))
}

export const Month: Story = {
  render: () =>
    widgetStory(Effect.gen(function* () {
      const browser = yield* Browser
      const events = yield* SubscriptionRef.make(week(yield* SubscriptionRef.get(browser.now)))
      yield* scheduler({ events, view: yield* SubscriptionRef.make<SchedulerView>("month") })
    }))
}
