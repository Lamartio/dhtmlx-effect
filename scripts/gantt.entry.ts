/** The Gantt alone, with no Toolbar of the Suite: to measure what the Suite adds. */
import "dhtmlx-gantt/codebase/dhtmlxgantt.css"
import "../src/styles.css"
import { Effect, SubscriptionRef } from "effect"
import { layerBrowserLive } from "../src/ui/browser"
import { gantt } from "../src/ui/gantt"
import { column, mount } from "../src/ui/host"
import { plan } from "../src/examples/sample-plan"

const element = document.getElementById("app")!
const tasks = Effect.runSync(SubscriptionRef.make(plan()))
mount(column([gantt({ tasks })], 0), element, layerBrowserLive)
