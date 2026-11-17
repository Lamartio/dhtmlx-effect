/** The page: the plugin of the sender in a frame, and the UI that it sends, drawn with DHTMLX. */
import "dhx-suite/codebase/suite.min.css"
import "@dhtmlx/kanban/dist/kanban.css"
import "@dhtmlx/diagram/codebase/diagram.min.css"
import "@dhtmlx/richtext/dist/richtext.css"
import "@dhtmlx/todolist/dist/todo.css"
import "@dhtmlx/booking/dist/booking.css"
import "@dhtmlx/pivot/dist/pivot.css"
import "@dhtmlx/spreadsheet/codebase/spreadsheet.min.css"
import "@dhtmlx/vault/codebase/vault.min.css"
import "../src/styles.css"
import { Effect } from "effect"
import { connectHost, layerBrowserLive, mount, openPlugin, renderPlugin } from "../src/host"

const PLUGIN = String(new URLSearchParams(location.search).get("plugin") ?? "http://localhost:4101")

const frame = document.createElement("iframe")
// The plugin has its own origin; the sandbox keeps it out of the page all the same.
frame.setAttribute("sandbox", "allow-scripts allow-same-origin")
frame.src = `${PLUGIN}/?host=${encodeURIComponent(location.origin)}`
frame.title = "The plugin"
document.getElementById("plugin")!.append(frame)

mount(
  Effect.gen(function* () {
    const page = yield* connectHost(yield* openPlugin(frame, PLUGIN))
    yield* renderPlugin(page)
  }),
  document.getElementById("app")!,
  layerBrowserLive
)
