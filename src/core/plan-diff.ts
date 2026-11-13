import type { GanttStatic } from "dhtmlx-gantt"
import { day, type Task } from "./gantt"

/**
 * The plan as changes, not as snapshots. DHTMLX keeps its own store and wants each change
 * by id: `addTask`, `updateTask`, `deleteTask`, `moveTask`, in one `batchUpdate`. A full `parse`
 * draws all again and loses the selection, the scroll and the open branches.
 */
export type PlanOp =
  | { readonly _tag: "add"; readonly task: Task; readonly index: number }
  | { readonly _tag: "update"; readonly task: Task }
  | { readonly _tag: "move"; readonly id: string; readonly parent: string | undefined; readonly index: number }
  | { readonly _tag: "remove"; readonly id: string }

const same = (a: Task, b: Task) => a.text === b.text && a.start === b.start && a.duration === b.duration && a.progress === b.progress

/** The index of each task among the tasks with the same parent. */
const places = (tasks: ReadonlyArray<Task>) => {
  const seen = new Map<string | undefined, number>()
  return new Map(tasks.map((task) => {
    const index = seen.get(task.parent) ?? 0
    seen.set(task.parent, index + 1)
    return [task.id, { parent: task.parent, index }] as const
  }))
}

/**
 * The changes from `before` to `after`, by task id: removes first, then adds and moves in the order
 * of `after`, so a parent is there before its children, then the updates.
 */
export const diffPlan = (before: ReadonlyArray<Task>, after: ReadonlyArray<Task>): ReadonlyArray<PlanOp> => {
  const old = new Map(before.map((task) => [task.id, task]))
  const ids = new Set(after.map((task) => task.id))
  const was = places(before)
  const now = places(after)
  const ops: Array<PlanOp> = before.filter((task) => !ids.has(task.id)).map((task) => ({ _tag: "remove", id: task.id }))
  const updates: Array<PlanOp> = []
  for (const task of after) {
    const previous = old.get(task.id)
    const place = now.get(task.id)!
    if (previous === undefined) {
      ops.push({ _tag: "add", task, index: place.index })
      continue
    }
    const placed = was.get(task.id)!
    if (placed.parent !== place.parent || placed.index !== place.index) ops.push({ _tag: "move", id: task.id, parent: place.parent, index: place.index })
    if (!same(previous, task)) updates.push({ _tag: "update", task })
  }
  return [...ops, ...updates]
}

/**
 * Runs the changes on the Gantt, with one redraw. A change that the Gantt has already (it came from a
 * drag in this Gantt) does nothing.
 */
export const applyPlan = (chart: GanttStatic, ops: ReadonlyArray<PlanOp>) => {
  if (ops.length === 0) return
  chart.batchUpdate(() => {
    for (const op of ops) {
      switch (op._tag) {
        case "remove":
          if (chart.isTaskExists(op.id)) chart.deleteTask(op.id)
          break
        case "add":
          if (!chart.isTaskExists(op.task.id)) {
            chart.addTask({ id: op.task.id, text: op.task.text, start_date: op.task.start as never, duration: op.task.duration, progress: op.task.progress }, op.task.parent ?? chart.config.root_id, op.index)
          }
          break
        case "move":
          if (chart.getParent(op.id) !== (op.parent ?? chart.config.root_id) || chart.getTaskIndex(op.id) !== op.index) chart.moveTask(op.id, op.index, op.parent ?? chart.config.root_id)
          break
        case "update": {
          const task = chart.getTask(op.task.id)
          if (task.text === op.task.text && day(task.start_date!) === op.task.start && task.duration === op.task.duration && Math.abs((task.progress ?? 0) - op.task.progress) < 0.005) break
          task.text = op.task.text
          task.start_date = chart.date.parseDate(op.task.start, "%Y-%m-%d")
          task.duration = op.task.duration
          task.progress = op.task.progress
          task.end_date = chart.calculateEndDate({ start_date: task.start_date, duration: op.task.duration })
          chart.updateTask(op.task.id)
          break
        }
      }
    }
  })
}

/** The plan with one task changed, added or removed by the Gantt. */
export const planWith = (tasks: ReadonlyArray<Task>, change: { readonly put: Task } | { readonly remove: string }): ReadonlyArray<Task> => {
  if ("remove" in change) return tasks.filter((task) => task.id !== change.remove && task.parent !== change.remove)
  const at = tasks.findIndex((task) => task.id === change.put.id)
  return at === -1 ? [...tasks, change.put] : tasks.map((task, index) => (index === at ? change.put : task))
}
