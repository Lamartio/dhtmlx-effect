import type { Meta, StoryObj } from "@storybook/html-vite"
import { Effect, SubscriptionRef } from "effect"
import { gantt } from "./gantt"
import { column } from "./host"
import { planner } from "../examples/planner"
import { plan } from "../examples/sample-plan"
import { widgetStory } from "../storybook/story"

/**
 * The DHTMLX Gantt (community edition, MIT). It takes the skin, the language, the today line and the
 * grid columns from the Browser layer. Change them in the toolbar of Storybook, or make the frame
 * narrow with the viewport tool: the Gantt changes in place.
 */
const meta: Meta = { title: "Products/Gantt" }
export default meta
type Story = StoryObj

export const Alone: Story = {
  render: () =>
    widgetStory(Effect.gen(function* () {
      const tasks = yield* SubscriptionRef.make(plan())
      yield* column([gantt({ tasks })], 0)
    }))
}

/** The toolbar drives the Gantt: Add task, Today, zoom in and out. Neither one knows the other. */
export const WithToolbar: Story = {
  name: "With a toolbar",
  render: () =>
    widgetStory(Effect.gen(function* () {
      const tasks = yield* SubscriptionRef.make(plan())
      yield* planner({ title: "Plan", tasks })
    }))
}
