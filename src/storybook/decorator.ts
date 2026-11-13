import type { Decorator, Preview } from "@storybook/html-vite"
import { Effect, Layer } from "effect"
import { Browser, type BrowserFacts, browserWith, setFacts } from "../ui/browser"
import { mount, type Widget } from "../ui/host"
import { treeOf } from "./story"

/** The fixed times of the Clock tool. `live` is the real clock. */
const CLOCKS: Record<string, string | undefined> = {
  live: undefined,
  "monday-morning": "2026-11-09T08:30:00Z",
  "new-year": "2026-12-31T23:45:00Z"
}

const now = (clock: string) => {
  const fixed = CLOCKS[clock]
  return fixed === undefined ? new Date() : new Date(fixed)
}

const factsOf = (globals: Record<string, unknown>): BrowserFacts => ({
  dark: globals["theme"] === "dark" || (globals["theme"] !== "light" && window.matchMedia("(prefers-color-scheme: dark)").matches),
  locale: String(globals["locale"] ?? "en-GB"),
  timeZone: String(globals["timeZone"] ?? "Europe/Amsterdam"),
  viewport: { width: window.innerWidth, height: window.innerHeight },
  now: now(String(globals["clock"] ?? "live"))
})

/** A story that runs: it takes new facts, and it can stop. */
export type RunningStory = {
  /** The facts that changed. */
  readonly update: (facts: Partial<BrowserFacts>) => void
  readonly dispose: () => void
}

type Running = RunningStory & {
  readonly id: string
  readonly args: string
  readonly element: HTMLElement
  clock: string
}

export type BrowserDecoratorOptions = {
  /** Wraps the tree of each story, for example to set the theme of the page around the widget. */
  readonly around?: (widget: Widget) => Widget
  /**
   * Runs a story that is not an Effect tree (a React story next to the Effect ones, for example) in
   * `element`, with the same facts. Gives undefined for a result that it does not know.
   */
  readonly other?: (result: unknown, element: HTMLElement, facts: BrowserFacts) => RunningStory | undefined
  /** The class of the element around each story. Default: `dhxe-story`. */
  readonly className?: string
}

/**
 * The tools in the toolbar of Storybook that feed the Browser layer: dark mode, language, time zone
 * and clock. Spread it into the preview: `{ ...browserGlobals, decorators: [browserDecorator()] }`.
 */
export const browserGlobals = {
  globalTypes: {
    theme: {
      description: "Dark mode, as the Browser layer gives it",
      toolbar: { title: "Theme", icon: "mirror", dynamicTitle: true, items: [{ value: "system", title: "System" }, { value: "light", title: "Light" }, { value: "dark", title: "Dark" }] }
    },
    locale: {
      description: "The language of the browser",
      toolbar: { title: "Locale", icon: "globe", dynamicTitle: true, items: ["en-GB", "en-US", "nl-NL", "de-DE", "fr-FR", "ja-JP"] }
    },
    timeZone: {
      description: "The time zone of the browser",
      toolbar: { title: "Zone", icon: "location", dynamicTitle: true, items: ["Europe/Amsterdam", "America/New_York", "Asia/Tokyo", "UTC"] }
    },
    clock: {
      description: "The time that the widgets take as now",
      toolbar: { title: "Clock", icon: "time", dynamicTitle: true, items: [{ value: "live", title: "Live" }, { value: "monday-morning", title: "Mon 9 Nov, 08:30 UTC" }, { value: "new-year", title: "31 Dec, 23:45 UTC" }] }
    }
  },
  initialGlobals: { theme: "system", locale: "en-GB", timeZone: "Europe/Amsterdam", clock: "live" }
} satisfies Pick<Preview, "globalTypes" | "initialGlobals">

/**
 * The Browser layer of Storybook, as a decorator. Dark mode, language, time zone and clock come from
 * the toolbar of Storybook (`browserGlobals`); the size is the size of the frame, which the viewport
 * tool of Storybook sets. A change goes into the running tree: the story is not mounted again.
 */
export const browserDecorator = (options: BrowserDecoratorOptions = {}): Decorator => {
  /** One running tree for each canvas: the story canvas, or a story on a docs page. */
  const running = new Map<HTMLElement, Running>()
  const each = (f: (run: Running) => void) => {
    for (const run of running.values()) f(run)
  }
  window.addEventListener("resize", () => each((run) => run.update({ viewport: { width: window.innerWidth, height: window.innerHeight } })))
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", (event) => each((run) => run.update({ dark: event.matches })))
  setInterval(() => each((run) => run.clock === "live" && run.update({ now: new Date() })), 60_000)

  return (story, context) => {
    const canvas = context.canvasElement
    const facts = factsOf(context.globals)
    const args = JSON.stringify(context.args)
    const before = running.get(canvas)
    // The same story with other globals: the tree takes the new facts, and the element stays.
    if (before !== undefined && before.id === context.id && before.args === args) {
      before.clock = String(context.globals["clock"] ?? "live")
      const { now: fixed, ...rest } = facts
      before.update(before.clock === "live" ? rest : { ...rest, now: fixed })
      return before.element
    }
    if (before !== undefined) {
      running.delete(canvas)
      before.dispose()
    }
    const result = story()
    const element = document.createElement("div")
    element.className = options.className ?? "dhxe-story"
    const clock = String(context.globals["clock"] ?? "live")
    const tree = treeOf(result)
    if (tree !== undefined) {
      const browser = Effect.runSync(browserWith(facts))
      const mounted = mount(options.around === undefined ? tree : options.around(tree), element, Layer.succeed(Browser)(browser))
      running.set(canvas, { id: context.id, args, element, clock, update: (next) => Effect.runSync(setFacts(browser, next)), dispose: () => void mounted.dispose() })
      return element
    }
    const other = options.other?.(result, element, facts)
    if (other === undefined) return result
    running.set(canvas, { id: context.id, args, element, clock, ...other })
    return element
  }
}
