import { Effect, type Scope, SubscriptionRef } from "effect"
import { type Entry, history, type Input, input, recordInput } from "./model"

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

/** The zoom levels, from days to months. */
export const ZOOM_LEVELS = ["day", "week", "month"] as const
export type Zoom = (typeof ZOOM_LEVELS)[number]

/** One level in, or one level out. */
export const zoomStep = (level: Zoom, step: -1 | 1): Zoom =>
  ZOOM_LEVELS[Math.min(ZOOM_LEVELS.length - 1, Math.max(0, ZOOM_LEVELS.indexOf(level) + step))]!

/** A date as `YYYY-MM-DD`, in the time of the browser. */
export const day = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`

let added = 0
/** The plan with one new task of two days, from `now`. */
export const withNewTask = (tasks: ReadonlyArray<Task>, text: string, now: Date): ReadonlyArray<Task> =>
  [...tasks, { id: `new-${++added}`, text, start: day(now), duration: 2, progress: 0 }]

/** The plan with one task changed, added or removed by the Gantt. A remove takes the children of the task too. */
export const planWith = (tasks: ReadonlyArray<Task>, change: { readonly put: Task } | { readonly remove: string }): ReadonlyArray<Task> => {
  if ("remove" in change) return tasks.filter((task) => task.id !== change.remove && task.parent !== change.remove)
  const at = tasks.findIndex((task) => task.id === change.put.id)
  return at === -1 ? [...tasks, change.put] : tasks.map((task, index) => (index === at ? change.put : task))
}

export type GanttState = { readonly zoom: Zoom; readonly tasks: ReadonlyArray<Task> }

export type GanttModel = {
  /** The plan. The model holds it all: a plan is small. */
  readonly tasks: SubscriptionRef.SubscriptionRef<ReadonlyArray<Task>>
  readonly zoom: SubscriptionRef.SubscriptionRef<Zoom>
  readonly zoomIn: Effect.Effect<void>
  readonly zoomOut: Effect.Effect<void>
  /** A new task of two days, from `now`. */
  readonly addTask: (text: string, now: Date) => Effect.Effect<void>
  /** A task that the user made, moved, resized or renamed. A task under a parent that is not in the plan changes nothing. */
  readonly putTask: (task: Task) => Effect.Effect<void>
  /** Takes a task and its children out. A task that is not in the plan changes nothing. */
  readonly removeTask: (id: string) => Effect.Effect<void>
  readonly recent: Effect.Effect<ReadonlyArray<Entry>>
  readonly snapshot: Effect.Effect<GanttState>
}

export type GanttModelOptions = {
  readonly tasks: Input<ReadonlyArray<Task>>
  /** Default: `day`. */
  readonly zoom?: Input<Zoom>
  /** How many entries `recent` keeps. Default: 0. */
  readonly history?: number
}

/** The model of a Gantt: the plan as input, the zoom as intent, and the changes of the user as actions. */
export const ganttModel = (options: GanttModelOptions): Effect.Effect<GanttModel, never, Scope.Scope> =>
  Effect.gen(function* () {
    const tasks = yield* input<ReadonlyArray<Task>>(options.tasks, [])
    const zoom = yield* input<Zoom>(options.zoom, "day")
    const log = yield* history(options.history ?? 0)
    yield* recordInput(log, "tasks", tasks)
    yield* recordInput(log, "zoom", zoom)
    const action = (name: string, value: unknown) => log.record({ _tag: "action", name, value })
    const step = (name: string, by: -1 | 1) =>
      Effect.gen(function* () {
        yield* action(name, undefined)
        const now = yield* SubscriptionRef.get(zoom)
        if (zoomStep(now, by) !== now) yield* SubscriptionRef.set(zoom, zoomStep(now, by))
      })
    const has = (id: string) => Effect.map(SubscriptionRef.get(tasks), (all) => all.some((task) => task.id === id))
    return {
      tasks,
      zoom,
      zoomIn: step("zoomIn", -1),
      zoomOut: step("zoomOut", 1),
      addTask: (text, now) =>
        Effect.gen(function* () {
          yield* action("addTask", text)
          yield* SubscriptionRef.update(tasks, (all) => withNewTask(all, text, now))
        }),
      putTask: (task) =>
        Effect.gen(function* () {
          if (task.parent !== undefined && !(yield* has(task.parent))) return
          yield* action("putTask", task)
          yield* SubscriptionRef.update(tasks, (all) => planWith(all, { put: task }))
        }),
      removeTask: (id) =>
        Effect.gen(function* () {
          if (!(yield* has(id))) return
          yield* action("removeTask", id)
          yield* SubscriptionRef.update(tasks, (all) => planWith(all, { remove: id }))
        }),
      recent: log.recent,
      snapshot: Effect.all({ zoom: SubscriptionRef.get(zoom), tasks: SubscriptionRef.get(tasks) })
    }
  })
