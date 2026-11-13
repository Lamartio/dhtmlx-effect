import { Effect, Stream, SubscriptionRef } from "effect"
import { gantt, type Task } from "../ui/gantt"
import { forEachReported } from "../ui/problems"
import { column } from "../ui/host"
import { toolbar, toolbarButton, toolbarSeparator, toolbarSpacer, toolbarTitle } from "../ui/toolbar"

/** The buttons of the planner, each as the stream of its clicks. */
const plannerBar = (title: string) =>
  Effect.gen(function* () {
    yield* toolbarTitle(title)
    yield* toolbarSeparator
    const add = yield* toolbarButton({ label: "Add task", color: "primary" })
    yield* toolbarSpacer
    const today = yield* toolbarButton({ label: "Today" })
    const zoomIn = yield* toolbarButton({ label: "+", tooltip: "Zoom in" })
    const zoomOut = yield* toolbarButton({ label: "−", tooltip: "Zoom out" })
    return { add, today, zoomIn, zoomOut }
  })

/**
 * A toolbar on a Gantt: the proof that the parts fit. Neither one knows the other. The planner only
 * wires the clicks of the toolbar to the commands of the Gantt.
 */
export const planner = (options: { readonly title: string; readonly tasks: SubscriptionRef.SubscriptionRef<ReadonlyArray<Task>> }) =>
  Effect.gen(function* () {
    const [bar, chart] = yield* column([toolbar(plannerBar(options.title)), gantt({ tasks: options.tasks })])
    let n = 0
    // A click that fails is reported, and that button stops: the others go on.
    const wire = <R>(name: string, clicks: Stream.Stream<void>, run: Effect.Effect<void, never, R>) =>
      forEachReported(`The button ${name}`, clicks, () => run)
    yield* wire("Add task", bar.add, Effect.suspend(() => chart.addTask(`New task ${++n}`)))
    yield* wire("Today", bar.today, chart.today)
    yield* wire("Zoom in", bar.zoomIn, chart.zoomIn)
    yield* wire("Zoom out", bar.zoomOut, chart.zoomOut)
    return chart
  })
