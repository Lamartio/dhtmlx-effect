/** The page: the plugin of the sender in a frame, and the UI that it sends, drawn with DHTMLX. */
import "dhx-suite/codebase/suite.min.css"
import "@dhtmlx/kanban/dist/kanban.css"
import "../src/styles.css"
import { Effect } from "effect"
import { connectHost } from "../src/model/remote"
import { openPlugin } from "../src/model/transport"
import { layerBrowserLive } from "../src/ui/browser"
import { mount } from "../src/ui/host"
import { renderPlugin } from "../src/ui/plugin-host"

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
