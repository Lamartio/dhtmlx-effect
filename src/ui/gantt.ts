import type { GanttStatic } from "dhtmlx-gantt"
import { Effect, Option, Stream, SubscriptionRef } from "effect"
import { makeChart, makeTodayLine, readTask, RENDER_EVENTS, showDark, showLocale, showPlan, showWidth } from "../core/gantt"
import { applyPlan, diffPlan } from "../core/plan-diff"
import { type GanttModel, ganttModel, type GanttModelOptions } from "../model/gantt"
import { Browser, follow } from "./browser"
import { Host, resource } from "./host"
import { reportedCallback, reporting } from "./problems"

export { ganttLanguage, type Task, type Zoom, ZOOM_LEVELS } from "../core/gantt"

/** The plan (`tasks`): the Gantt shows each change, and a drag in the Gantt writes the plan back. */
export type GanttOptions = GanttModelOptions

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
 *
 * The Gantt runs on its model (`ganttModel`): a drag, a resize, a new name, a new task and a delete
 * in the Gantt are its actions, and the plan and the zoom of the model show in the Gantt.
 */
export const renderGantt = (model: GanttModel) =>
  Effect.gen(function* () {
    const host = yield* Host
    const browser = yield* Browser
    const chart = yield* resource("gantt", () => makeChart(host), (chart) => chart.destructor())

    // From the plan to the Gantt, as changes: a scan over the snapshots gives the changes between two
    // of them. The first one is a parse. Only the changed tasks are drawn again, so the selection, the
    // scroll and the open branches stay.
    let applying = false
    yield* SubscriptionRef.changes(model.tasks).pipe(
      Stream.zipWithPrevious,
      Stream.runForEach(([before, after]) =>
        Effect.sync(() => {
          applying = true
          try {
            if (Option.isNone(before) || before.value === after) showPlan(chart, after)
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
    const send = (action: Effect.Effect<void>) => {
      if (!applying) Effect.runSync(action)
    }
    yield* listen(chart, "onAfterTaskUpdate", (id) => send(model.putTask(readTask(chart, id))))
    yield* listen(chart, "onAfterTaskAdd", (id) => send(model.putTask(readTask(chart, id))))
    yield* listen(chart, "onAfterTaskDelete", (id) => send(model.removeTask(String(id))))

    yield* follow(model.zoom, (level) => chart.ext.zoom.setLevel(level))
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
      zoom: model.zoom,
      zoomIn: model.zoomIn,
      zoomOut: model.zoomOut,
      today: SubscriptionRef.get(browser.now).pipe(Effect.flatMap((now) => Effect.sync(() => chart.showDate(now)))),
      addTask: (text: string) => SubscriptionRef.get(browser.now).pipe(Effect.flatMap((now) => model.addTask(text, now))),
      model: model as GanttModel
    }
  })

export const gantt = (options: GanttOptions) => Effect.flatMap(ganttModel(options), renderGantt)
