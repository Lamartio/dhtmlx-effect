# dhtmlx-effect

Run [DHTMLX](https://dhtmlx.com) widgets as [Effect](https://effect.website) programs.

DHTMLX widgets are imperative: you make one, you change it, you call `destructor()`. A React wrapper fights that model, as React wants to render again. An Effect tree follows it:

- **A scope is the life of a widget.** `acquireRelease` makes the widget and registers its destructor. Scopes release in reverse order, so children go before their parents, and nothing stays behind.
- **The host element is a service.** A widget asks for `Host` and draws in it. A parent gives each child an element of its own. This replaces props and children.
- **State changes the widget in place.** A widget follows a `SubscriptionRef` or a `Stream` and calls the DHTMLX API. There is no render, and no remount.
- **Events are streams.** A button gives its clicks as a `Stream`. A Gantt writes a drag back into the `SubscriptionRef` of its plan.

The book with each widget, live: [lamartio.github.io/dhtmlx-effect](https://lamartio.github.io/dhtmlx-effect/).

This is not an official DHTMLX project.

## Status

Early: the API can change in each commit, and the package is not on npm yet. It is on Effect 4.

## Install

```sh
bun add github:Lamartio/dhtmlx-effect effect @effect/platform-browser
# and the DHTMLX packages that you use:
bun add dhx-suite dhtmlx-gantt dhtmlx-scheduler @dhtmlx/kanban @dhtmlx/diagram
bun add @dhtmlx/richtext @dhtmlx/todolist @dhtmlx/booking @dhtmlx/pivot @dhtmlx/spreadsheet @dhtmlx/vault
```

The package ships TypeScript source, so use a bundler that reads TypeScript (Vite, Bun). Each DHTMLX package is an optional peer dependency: you install only what you import.

| Import | Needs | Parts |
|---|---|---|
| `dhtmlx-effect` | `effect` | `Host`, `Browser`, `mount`, `resource`, `column`, `swap`, `keyed`, `slot`, `Problems` |
| `dhtmlx-effect/suite` | `dhx-suite` | Button, Chart, Toolbar, Layout, Tabbar, Sidebar, Window, Popup, Grid, Tree, List, DataView, Form from a Schema, Calendar, DatePicker, Timepicker, Slider, Colorpicker, Combobox, file picker, Menu, Ribbon, ContextMenu, and confirm, alert, message and tooltip as Effects |
| `dhtmlx-effect/gantt` | `dhtmlx-gantt` | Gantt |
| `dhtmlx-effect/scheduler` | `dhtmlx-scheduler` | Scheduler |
| `dhtmlx-effect/kanban` | `@dhtmlx/kanban` | Kanban |
| `dhtmlx-effect/diagram` | `@dhtmlx/diagram` | Diagram (flowchart, org chart, mind map, PERT chart) and its editor |
| `dhtmlx-effect/richtext` | `@dhtmlx/richtext` | RichText editor, with HTML, Markdown or plain text |
| `dhtmlx-effect/todolist` | `@dhtmlx/todolist` | To Do List |
| `dhtmlx-effect/booking` | `@dhtmlx/booking` | Booking |
| `dhtmlx-effect/pivot` | `@dhtmlx/pivot` | Pivot table |
| `dhtmlx-effect/spreadsheet` | `@dhtmlx/spreadsheet` | Spreadsheet |
| `dhtmlx-effect/vault` | `@dhtmlx/vault` | Vault, the file uploader |
| `dhtmlx-effect/storybook` | `@storybook/html-vite` | Stories that are Effect trees, with the Browser layer in the toolbar |
| `dhtmlx-effect/styles.css` | | The few styles of the wrappers. Load it after the CSS of DHTMLX |

## A first tree

A toolbar on a Gantt. Neither one knows the other: the tree only wires the clicks of the toolbar to the commands of the Gantt.

```ts
import "dhx-suite/codebase/suite.min.css"
import "dhtmlx-gantt/codebase/dhtmlxgantt.css"
import "dhtmlx-effect/styles.css"
import { Effect, SubscriptionRef } from "effect"
import { column, forEachReported, layerBrowserLive, mount } from "dhtmlx-effect"
import { gantt, type Task } from "dhtmlx-effect/gantt"
import { toolbar, toolbarButton, toolbarSpacer, toolbarTitle } from "dhtmlx-effect/suite"

const planner = (tasks: SubscriptionRef.SubscriptionRef<ReadonlyArray<Task>>) =>
  Effect.gen(function* () {
    // Two parts, one above the other. Each gets an element of its own as its Host.
    const [bar, chart] = yield* column([
      toolbar(Effect.gen(function* () {
        yield* toolbarTitle("Plan")
        yield* toolbarSpacer
        const today = yield* toolbarButton({ label: "Today" })
        const zoomIn = yield* toolbarButton({ label: "+", tooltip: "Zoom in" })
        return { today, zoomIn }
      })),
      gantt({ tasks })
    ])
    // Each button is the stream of its clicks. The fibers end when the scope of the planner closes.
    yield* forEachReported("The button Today", bar.today, () => chart.today)
    yield* forEachReported("The button Zoom in", bar.zoomIn, () => chart.zoomIn)
  })

const tasks = Effect.runSync(SubscriptionRef.make<ReadonlyArray<Task>>([
  { id: "a", text: "Design", start: "2026-11-09", duration: 5, progress: 0.4 },
  { id: "b", text: "Build", start: "2026-11-16", duration: 8, progress: 0 }
]))

// The one place where the tree meets the page.
const mounted = mount(planner(tasks), document.getElementById("app")!, layerBrowserLive)
// Later: each widget, listener and element goes, children first.
// await mounted.dispose()
```

A change of `tasks` goes into the Gantt as changes by id (add, update, move, remove), so the selection, the scroll and the open branches stay. A drag in the Gantt writes that one task back into `tasks`.

## The ideas

### `Host`, `Browser` and a scope

```ts
type Widget<A = unknown> = Effect.Effect<A, never, Host | Browser | Scope.Scope>
```

- `Host` is the `HTMLElement` that the widget draws in.
- `Browser` holds the facts of the browser, each as a `SubscriptionRef`: `dark`, `locale`, `timeZone`, `viewport` and `now`. A widget follows them and does not read `window`. The app gives `layerBrowserLive`, a test gives `layerBrowserFixed(...)`, and Storybook gives a layer that its toolbar drives. A change of the theme or the language goes into the running widget, with no remount.
- The scope is the life of the widget. `resource(kind, make, destroy)` makes a DHTMLX object for the life of the scope.

A wrapper of your own is short:

```ts
import { Slider } from "dhx-suite"
import { Effect } from "effect"
import { Host, resource } from "dhtmlx-effect"

const slider = Effect.gen(function* () {
  const host = yield* Host
  return yield* resource("slider", () => new Slider(host, { min: 0, max: 10 }), (view) => view.destructor())
})
```

### Slots as requirements

A child that may only be in one parent requires a service that only that parent gives. A toolbar button needs a `ToolbarSlot`, and only `toolbar(...)` provides one. So a toolbar button outside a toolbar does not compile.

### Modes, tabs and lists

- `swap` shows one part at a time. A new part closes the scope of the part before it, so its widgets and listeners go.
- `keyed(items, key, part)` runs a part for each item of a list, as `key` does in React. A new key starts a part in a scope of its own, a key that goes closes that scope, and a changed item goes into the `SubscriptionRef` of its part.
- `tabbar` and `sidebar` mount only the open part.

### One store, many widgets

`dataCollection(rows)` and `treeCollection(rows)` drive a DHTMLX data collection from a `SubscriptionRef` of rows, as changes by id. A Grid, a List and a DataView on the same collection each draw only what changed.

### A widget never stops in silence

A fiber of a widget that dies reports to the `Problems` service. `mount` shows the report in a red bar at the top of the tree, and writes it to the log. A callback that DHTMLX calls cannot throw into DHTMLX (`reportedCallback`). A tree that cannot start closes.

### The scheduler

`mount` runs the tree on `MixedScheduler("sync")`. All the work of a change is done before the browser paints, as a React render is. The price is the same as in React: a long loop in a widget blocks the page.

## Watch out

1. **A widget measures its host.** `mount` waits until the element is in the page.
2. **DHTMLX takes no element in a cell.** A layout cell, a window and a popup take a widget of DHTMLX or HTML. `slot` puts an element in a place of HTML in the cell, and moves it back after DHTMLX draws the cell again.
3. **A two-way value needs a guard.** A value that came from a ref must not go back into it. Each two-way part here has an `applying` flag or compares the values.
4. **Items are not always widgets.** A toolbar button is a row in `toolbar.data`: its release is `data.remove(id)`, not a destructor.
5. **Some settings are for the whole page.** The names of the calendar in the Suite, the skin of the Gantt, and the one Scheduler instance of the community edition.
6. **The CSS of DHTMLX loads fonts from a CDN.** The Suite loads its icon font from `cdn.dhtmlx.com`, the Kanban from `cdn.svar.dev`.
7. **The Gantt does not run in happy-dom.** The tests here run in Chromium, with the browser mode of Vitest.

## Licence

The code in this repository is under the [MIT licence](./LICENSE). It contains no DHTMLX code.

DHTMLX has its own licences. On npm, the free Gantt (`dhtmlx-gantt` 10) is under MIT. The free editions of the Suite, the Scheduler, the Kanban, the Diagram and the other products are under GPL-2.0, so an app that ships them must follow the GPL too. For a closed app, buy a commercial licence from DHTMLX. This text is not legal advice: read the licence of each DHTMLX package that you use.

## Components

[docs/components.md](./docs/components.md) lists each product and widget of DHTMLX, and what this repository has for it: 35 are wrapped, and 4 listings in the book are empty.

## Develop

```sh
bun install
bun run typecheck
bunx playwright install chromium   # one time, for the tests
bun run test                       # Vitest in Chromium
bun run storybook                  # http://localhost:6007
bun run size                       # what a Gantt with a toolbar costs in a page
```

- `src/core/` has plain functions, with no Effect and no DOM where that is possible: the diff of rows, the diff of a plan, the check of a form.
- `src/ui/` has the widgets. Each one has stories (`*.stories.ts`) and tests (`*.test.ts`) next to it.
- `src/examples/` has the planner of the stories.
- A story is an Effect tree: `widgetStory(tree)`. The toolbar of Storybook sets the theme, the language, the time zone and the clock of the `Browser` layer.
