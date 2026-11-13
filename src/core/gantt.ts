import { Gantt, type GanttStatic } from "dhtmlx-gantt"

/**
 * What the Gantt does, with no Effect: plain functions on a `GanttStatic`. The Effect part in
 * `src/ui/gantt.ts` only wires them to streams and scopes, and another wrapper (React, for example)
 * can call the same functions.
 */

/** One task of a plan. Days are `YYYY-MM-DD`. */
export type Task = {
  readonly id: string
  readonly text: string
  readonly start: string
  /** Days. */
  readonly duration: number
  /** 0 to 1. */
  readonly progress: number
  readonly parent?: string
}

/** The language code of the Gantt for a BCP 47 tag: `nl-NL` gives `nl`, `ja` gives `jp`. English when it has none. */
export const ganttLanguage = (locale: string): string => {
  const primary = locale.toLowerCase().split(/[-_]/)[0] ?? "en"
  const mapped = ({ ja: "jp", ko: "kr", zh: "cn", uk: "ua", nb: "no", nn: "no" } as Record<string, string>)[primary] ?? primary
  return LANGUAGES.has(mapped) ? mapped : "en"
}
const LANGUAGES = new Set("ar be ca cn cs da de el en es fi fr he hr hu id it jp kr nl no pl pt ro ru si sk sv tr ua".split(" "))

/** The zoom levels, from days to months. */
export const ZOOM_LEVELS = ["day", "week", "month"] as const
export type Zoom = (typeof ZOOM_LEVELS)[number]

/** One level in, or one level out. */
export const zoomStep = (level: Zoom, step: -1 | 1): Zoom =>
  ZOOM_LEVELS[Math.min(ZOOM_LEVELS.length - 1, Math.max(0, ZOOM_LEVELS.indexOf(level) + step))]!

/** Below this width the grid shows only the names of the tasks. */
export const NARROW = 720

export const day = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`

let added = 0
/** The plan with one new task of two days, from now. */
export const withNewTask = (tasks: ReadonlyArray<Task>, text: string, now: Date): ReadonlyArray<Task> =>
  [...tasks, { id: `new-${++added}`, text, start: day(now), duration: 2, progress: 0 }]

/** A new Gantt in the host, with our date format and zoom levels. */
export const makeChart = (host: HTMLElement): GanttStatic => {
  const chart = Gantt.getGanttInstance()
  chart.config.date_format = "%Y-%m-%d"
  chart.config.open_tree_initially = true
  chart.ext.zoom.init({
    levels: [
      { name: "day", scale_height: 50, min_column_width: 40, scales: [{ unit: "week", step: 1, format: "%d %M" }, { unit: "day", step: 1, format: "%d" }] },
      { name: "week", scale_height: 50, min_column_width: 50, scales: [{ unit: "month", step: 1, format: "%F %Y" }, { unit: "week", step: 1, format: "#%W" }] },
      { name: "month", scale_height: 50, min_column_width: 70, scales: [{ unit: "year", step: 1, format: "%Y" }, { unit: "month", step: 1, format: "%M" }] }
    ]
  })
  host.classList.add("dhxe-gantt")
  chart.init(host)
  return chart
}

/** Shows the plan: all tasks again. */
export const showPlan = (chart: GanttStatic, tasks: ReadonlyArray<Task>) => {
  chart.clearAll()
  chart.parse({
    data: tasks.map((task) => ({
      id: task.id,
      text: task.text,
      start_date: task.start,
      duration: task.duration,
      progress: task.progress,
      open: true,
      ...(task.parent === undefined ? {} : { parent: task.parent })
    })),
    links: []
  })
}

/** The task with this id, as the plan keeps it, after a change in the Gantt. */
export const readTask = (chart: GanttStatic, id: string | number): Task => {
  const task = chart.getTask(id)
  const parent = task.parent === undefined || task.parent === 0 || task.parent === chart.config.root_id ? undefined : String(task.parent)
  return {
    id: String(task.id),
    text: String(task.text),
    start: day(task.start_date!),
    duration: task.duration ?? 1,
    progress: Math.round((task.progress ?? 0) * 100) / 100,
    ...(parent === undefined ? {} : { parent })
  }
}

export const showDark = (chart: GanttStatic, host: HTMLElement, dark: boolean) => {
  chart.setSkin(dark ? "dark" : "terrace")
  // `setSkin` marks the whole page. The mark on the host wins for this Gantt, so two of them can differ.
  host.setAttribute("data-gantt-theme", dark ? "dark" : "terrace")
}

/** The last width of the window for each Gantt: a new language makes the columns again. */
const widths = new WeakMap<GanttStatic, number>()

export const showLocale = (chart: GanttStatic, locale: string) => {
  chart.i18n.setLocale(ganttLanguage(locale))
  // The labels of the columns are copied when the columns are made, so they need the new language.
  showWidth(chart, widths.get(chart) ?? Number.POSITIVE_INFINITY)
}

/** The columns of the grid for the width of the window, with the labels of the language. */
export const showWidth = (chart: GanttStatic, width: number) => {
  widths.set(chart, width)
  const narrow = width < NARROW
  const labels = chart.locale.labels
  chart.config.grid_width = narrow ? 160 : 360
  chart.config.columns = narrow
    ? [{ name: "text", label: labels.column_text ?? "Task", tree: true, width: "*" }]
    : [
        { name: "text", label: labels.column_text ?? "Task", tree: true, width: "*" },
        { name: "start_date", label: labels.column_start_date ?? "Start", align: "center", width: 90 },
        { name: "duration", label: labels.column_duration ?? "Days", align: "center", width: 50 },
        { name: "add", label: "", width: 44 }
      ]
  chart.render()
}

/**
 * The today line: a div of our own on the timeline, as the community Gantt has no marker plugin
 * (that is PRO). `place` puts it at `now`, again after each render of the Gantt.
 */
export const makeTodayLine = (chart: GanttStatic) => {
  const line = document.createElement("div")
  line.className = "dhxe-today"
  line.append(document.createElement("span"))
  let now = new Date()
  const place = () => {
    const area = (chart as unknown as { $task_data?: HTMLElement }).$task_data
    if (area === undefined) return
    if (line.parentElement !== area) area.append(line)
    line.style.left = `${chart.posFromDate(now)}px`
  }
  return {
    line,
    place,
    /** Moves the line to `date`, with its time in `timeZone`. */
    show: (date: Date, locale: string, timeZone: string) => {
      now = date
      line.firstElementChild!.textContent = new Intl.DateTimeFormat(locale, { timeZone, hour: "2-digit", minute: "2-digit" }).format(date)
      // `dateStyle` does not go with `timeZoneName`: Intl throws.
      line.title = new Intl.DateTimeFormat(locale, { timeZone, weekday: "long", day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit", timeZoneName: "short" }).format(date)
      place()
    }
  }
}

/** The events after which the Gantt drew its timeline again. */
export const RENDER_EVENTS = ["onGanttRender", "onDataRender"] as const
