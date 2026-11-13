import type { Meta, StoryObj } from "@storybook/html-vite"
import { Effect, Stream, SubscriptionRef } from "effect"
import { button } from "./button"
import { plan } from "../examples/sample-plan"
import { alive, column, Host, swap, type Widget } from "./host"
import { planner } from "../examples/planner"
import { element, inside, widgetStory } from "../storybook/story"

/**
 * The life of a tree. Mount runs a planner in a scope; Unmount closes that scope. The counts show each
 * DHTMLX object and listener that lives: after Unmount, only the buttons of this page are left.
 */
const meta: Meta = { title: "Lifecycle" }
export default meta
type Story = StoryObj

export const MountAndUnmount: Story = {
  name: "Mount and unmount",
  render: () =>
    widgetStory(Effect.gen(function* () {
      const tasks = yield* SubscriptionRef.make(plan())
      const [controls, stage] = yield* column([
        Effect.gen(function* () {
          const row = yield* element("div", "dhxe-row")
          const on = yield* inside(row, button({ label: "Mount" }))
          const off = yield* inside(row, button({ label: "Unmount", color: "secondary" }))
          const counts = yield* element("pre", "dhxe-log")
          yield* SubscriptionRef.changes(alive).pipe(
            Stream.runForEach((map) => Effect.sync(() => {
              counts.textContent = [...map].sort(([a], [b]) => a.localeCompare(b)).map(([kind, n]) => `${String(n).padStart(3)}  ${kind}`).join("\n")
            })),
            Effect.forkScoped
          )
          return { on: on.clicks, off: off.clicks }
        }),
        // The stage: what `show` runs gets the stage as its host.
        Effect.gen(function* () {
          const host = yield* Host
          const show = yield* swap
          return (part: Widget) => show(Effect.provideService(part, Host, host))
        })
      ], 1)
      yield* controls.on.pipe(Stream.runForEach(() => stage(planner({ title: "Mounted plan", tasks }))), Effect.forkScoped)
      yield* controls.off.pipe(Stream.runForEach(() => stage(Effect.void)), Effect.forkScoped)
    }))
}
