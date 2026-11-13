import type { Preview } from "@storybook/html-vite"
import { setTheme } from "dhx-suite"
import { Effect } from "effect"
import "dhx-suite/codebase/suite.min.css"
import "dhtmlx-gantt/codebase/dhtmlxgantt.css"
import "dhtmlx-scheduler/codebase/dhtmlxscheduler.css"
import "@dhtmlx/kanban/dist/kanban.css"
import "../src/styles.css"
import "../src/storybook.css"
import { Browser, follow } from "../src/ui/browser"
import { Host, type Widget } from "../src/ui/host"
import { browserDecorator, browserGlobals } from "../src/storybook/decorator"

/** The page around the widget follows the dark mode too, with the theme of the Suite. */
const withSuiteTheme = (widget: Widget): Widget =>
  Effect.gen(function* () {
    const host = yield* Host
    const browser = yield* Browser
    yield* follow(browser.dark, (dark) => setTheme(dark ? "dark" : "light", host))
    return yield* widget
  })

const preview: Preview = {
  ...browserGlobals,
  decorators: [browserDecorator({ around: withSuiteTheme })],
  // The tree itself, the Suite, then each product that stands alone. A listing of what has no wrapper
  // yet (docs/components.md) is in the section of its product.
  parameters: { layout: "fullscreen", options: { storySort: { method: "alphabetical", order: ["Core", "Suite", "Products", ["Gantt", "Scheduler", "Kanban", "*"], "*"] } } }
}

export default preview
