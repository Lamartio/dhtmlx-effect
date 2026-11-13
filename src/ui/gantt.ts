import type { GanttStatic } from "dhtmlx-gantt"
import { Effect, Option, Stream, SubscriptionRef } from "effect"
import {
  makeChart, makeTodayLine, readTask, RENDER_EVENTS, showDark, showLocale, showPlan, showWidth, type Task, withNewTask, type Zoom, zoomStep
} from "../core/gantt"
import { applyPlan, diffPlan, planWith } from "../core/plan-diff"
import { Browser, follow } from "./browser"
import { Host, resource } from "./host"
import { reportedCallback, reporting } from "./problems"

export { ganttLanguage, type Task, type Zoom, ZOOM_LEVELS } from "../core/gantt"

export type GanttOptions = {
  /** The plan. The Gantt shows each change; a drag in the Gantt writes the plan back. */
  readonly tasks: SubscriptionRef.SubscriptionRef<ReadonlyArray<Task>>
  readonly zoom?: SubscriptionRef.SubscriptionRef<Zoom>
}

/** A Gantt event for the life of the scope. A throw in `f` is reported, not given to the Gantt. */
const listen = (chart: GanttStatic, event: string, f: (id: string | number) => void) =>
  Effect.gen(function* () {
    const safe = yield* reportedCallback(`The Gantt, on ${event}`, f)
    return yield* resource("listener", () => chart.attachEvent(event as "onAfterTaskUpdate", safe, {}), (id) => chart.detachEvent(id))
  })

/**
 * A DHTMLX Gantt in the host. It takes what it shows from Effect: the plan from `tasks`, and from
 * `Browser` the skin (dark), the language of the scales, the today line (now and the time zone) and
 * the columns of the grid (the width of the window). Each one changes in place, with no remount.
 */
export const gantt = (options: GanttOptions) =>
  Effect.gen(function* () {
    const host = yield* Host
    const browser = yield* Browser
    const zoom = options.zoom ?? (yield* SubscriptionRef.make<Zoom>("day"))
    const chart = yield* resource("gantt", () => makeChart(host), (chart) => chart.destructor())

    // From the plan to the Gantt, as changes: a scan over the snapshots gives the changes between two
    // of them. The first one is a parse. Only the changed tasks are drawn again, so the selection, the
    // scroll and the open branches stay.
    let applying = false
    yield* SubscriptionRef.changes(options.tasks).pipe(
      Stream.zipWithPrevious,
      Stream.runForEach(([before, after]) =>
        Effect.sync(() => {
          applying = true
          try {
            if (Option.isNone(before)) showPlan(chart, after)
            else applyPlan(chart, diffPlan(before.value, after))
          } finally {
            applying = false
          }
        })),
      reporting("The Gantt, while it showed the plan"),
      Effect.forkScoped
    )
    // From the Gantt to the plan: one task for a drag, a resize or a new name. A change that came from
    // the plan is not sent back.
    const send = (change: Parameters<typeof planWith>[1]) => {
      if (!applying) Effect.runSync(SubscriptionRef.update(options.tasks, (tasks) => planWith(tasks, change)))
    }
    yield* listen(chart, "onAfterTaskUpdate", (id) => send({ put: readTask(chart, id) }))
    yield* listen(chart, "onAfterTaskAdd", (id) => send({ put: readTask(chart, id) }))
    yield* listen(chart, "onAfterTaskDelete", (id) => send({ remove: String(id) }))

    yield* follow(zoom, (level) => chart.ext.zoom.setLevel(level))
    yield* follow(browser.dark, (dark) => showDark(chart, host, dark))
    yield* follow(browser.locale, (locale) => showLocale(chart, locale))
    yield* follow(browser.viewport, (viewport) => showWidth(chart, viewport.width))

    // The today line: where `Browser.now` is, with the time in the zone of `Browser.timeZone`.
    const today = yield* resource("today line", () => makeTodayLine(chart), ({ line }) => line.remove())
    for (const event of RENDER_EVENTS) yield* listen(chart, event, today.place)
    const facts = { now: new Date(), locale: "en", timeZone: "UTC" }
    const label = (change: Partial<typeof facts>) => {
      Object.assign(facts, change)
      today.show(facts.now, facts.locale, facts.timeZone)
    }
    yield* follow(browser.timeZone, (timeZone) => label({ timeZone }))
    yield* follow(browser.locale, (locale) => label({ locale }))
    yield* follow(browser.now, (now) => label({ now }))

    return {
      chart,
      zoom,
      zoomIn: SubscriptionRef.update(zoom, (level) => zoomStep(level, -1)),
      zoomOut: SubscriptionRef.update(zoom, (level) => zoomStep(level, 1)),
      today: SubscriptionRef.get(browser.now).pipe(Effect.flatMap((now) => Effect.sync(() => chart.showDate(now)))),
      addTask: (text: string) =>
        SubscriptionRef.get(browser.now).pipe(Effect.flatMap((now) => SubscriptionRef.update(options.tasks, (tasks) => withNewTask(tasks, text, now))))
    }
  })
