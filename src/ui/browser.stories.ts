import type { Meta, StoryObj } from "@storybook/html-vite"
import { Effect } from "effect"
import { Browser, type BrowserFacts, follow } from "./browser"
import { element, widgetStory } from "../storybook/story"

/**
 * The Browser service itself: what a widget gets from it. In the book the layer comes from the
 * toolbar of Storybook and the size of the frame; in the app it comes from the real browser.
 */
const meta: Meta = { title: "Core/Browser layer" }
export default meta
type Story = StoryObj

const show: { readonly [K in keyof BrowserFacts]: (value: BrowserFacts[K], facts: Partial<BrowserFacts>) => string } = {
  dark: (dark) => (dark ? "dark" : "light"),
  locale: (locale) => `${locale} (${new Intl.DisplayNames([locale], { type: "language" }).of(locale) ?? locale})`,
  timeZone: (zone) => zone,
  viewport: (viewport) => `${viewport.width} × ${viewport.height}`,
  now: (now, facts) =>
    new Intl.DateTimeFormat(facts.locale ?? "en-GB", { timeZone: facts.timeZone ?? "UTC", weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", timeZoneName: "short" }).format(now)
}

export const Facts: Story = {
  render: () =>
    widgetStory(Effect.gen(function* () {
      const browser = yield* Browser
      const table = yield* element("table", "dhxe-facts")
      yield* element("p", "dhxe-note", "Change Theme, Locale, Zone or Clock in the toolbar, or the viewport: each row follows its SubscriptionRef.")
      const facts: Partial<Record<keyof BrowserFacts, unknown>> = {}
      const cells = new Map<keyof BrowserFacts, HTMLTableCellElement>()
      for (const key of Object.keys(show) as Array<keyof BrowserFacts>) {
        const row = table.insertRow()
        const name = document.createElement("th")
        name.textContent = key
        row.append(name)
        cells.set(key, row.insertCell())
      }
      const redraw = () => {
        for (const [key, cell] of cells) {
          const value = facts[key]
          if (value !== undefined) cell.textContent = (show[key] as (value: unknown, facts: Partial<BrowserFacts>) => string)(value, facts as Partial<BrowserFacts>)
        }
      }
      for (const key of cells.keys()) {
        yield* follow(browser[key] as never, (value: unknown) => {
          facts[key] = value
          redraw()
        })
      }
    }))
}
