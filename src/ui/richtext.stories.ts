import type { Meta, StoryObj } from "@storybook/html-vite"
import { Effect, Stream, SubscriptionRef } from "effect"
import "@dhtmlx/richtext/dist/richtext.css"
import { element, inside, widgetStory } from "../storybook/story"
import { button } from "./button"
import { column, Host } from "./host"
import { richtext } from "./richtext"

/** The RichText editor. The text is in a store, as Markdown here: type in the editor, and the store follows. */
const meta: Meta = { title: "Products/RichText" }
export default meta
type Story = StoryObj

export const Markdown: Story = {
  render: () =>
    widgetStory(Effect.gen(function* () {
      const value = yield* SubscriptionRef.make("# Weekly report\n\nThis week we moved the **docs** to the new site.\n\n- One point\n- A second point")
      const [controls] = yield* column([
        Effect.gen(function* () {
          const row = yield* element("div", "dhxe-row")
          const set = yield* inside(row, button({ label: "Set a new text from the code", color: "secondary" }))
          const out = yield* element("pre", "dhxe-log")
          return { set, out }
        }),
        Effect.gen(function* () {
          const host = yield* Host
          host.style.minHeight = "360px"
          return yield* richtext({ value, format: "markdown" })
        })
      ])
      yield* SubscriptionRef.changes(value).pipe(Stream.runForEach((text) => Effect.sync(() => (controls.out.textContent = text))), Effect.forkScoped)
      let n = 0
      yield* controls.set.clicks.pipe(Stream.runForEach(() => SubscriptionRef.set(value, `## Text ${++n}\n\nSet by the code.`)), Effect.forkScoped)
    }))
}

/** A reader: no toolbar, and no way to change the text. A new text from the code still shows. */
export const ReadOnly: Story = {
  render: () =>
    widgetStory(Effect.gen(function* () {
      const value = yield* SubscriptionRef.make("<h2>Read only</h2><p>Click in the text and type: nothing changes. You can still <a href=\"https://dhtmlx.com\">follow a link</a>, select and copy.</p><ul><li>One point</li><li>A second point</li></ul>")
      const [controls] = yield* column([
        Effect.gen(function* () {
          const row = yield* element("div", "dhxe-row")
          return { set: yield* inside(row, button({ label: "Show another text", color: "secondary" })) }
        }),
        Effect.gen(function* () {
          const host = yield* Host
          host.style.minHeight = "360px"
          return yield* richtext({ value, readOnly: true })
        })
      ])
      let n = 0
      yield* controls.set.clicks.pipe(Stream.runForEach(() => SubscriptionRef.set(value, `<h2>Text ${++n}</h2><p>Set by the code, in a reader.</p>`)), Effect.forkScoped)
    }))
}
