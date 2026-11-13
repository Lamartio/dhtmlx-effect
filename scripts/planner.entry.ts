/**
 * One Gantt as a page would load it: the planner (toolbar and Gantt) with the live Browser layer.
 * `scripts/size.ts` builds this file to measure what it costs.
 */
import "dhx-suite/codebase/suite.min.css"
import "dhtmlx-gantt/codebase/dhtmlxgantt.css"
import "../src/styles.css"
import { Effect, SubscriptionRef } from "effect"
import { layerBrowserLive } from "../src/ui/browser"
import { mount } from "../src/ui/host"
import { planner } from "../src/examples/planner"
import { plan } from "../src/examples/sample-plan"

const element = document.getElementById("app")!
const tasks = Effect.runSync(SubscriptionRef.make(plan()))
mount(planner({ title: "Plan", tasks }), element, layerBrowserLive)
