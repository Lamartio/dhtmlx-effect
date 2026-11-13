import type { Task } from "../ui/gantt"

// Not in a stories file: Storybook takes each export of one as a story.
/** A plan around now, so the today line is in view. */
export const plan = (now = new Date()): ReadonlyArray<Task> => {
  const at = (days: number) => {
    const date = new Date(now)
    date.setDate(date.getDate() + days)
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`
  }
  return [
    { id: "m1", text: "Widgets in Effect", start: at(-8), duration: 24, progress: 0.35 },
    { id: "t1", text: "Effect widget tree", start: at(-8), duration: 5, progress: 1, parent: "m1" },
    { id: "t2", text: "Browser layer", start: at(-4), duration: 3, progress: 1, parent: "m1" },
    { id: "t3", text: "Toolbar and Button", start: at(-2), duration: 4, progress: 0.6, parent: "m1" },
    { id: "t4", text: "Gantt", start: at(0), duration: 6, progress: 0.2, parent: "m1" },
    { id: "t5", text: "Storybook", start: at(5), duration: 3, progress: 0, parent: "m1" },
    { id: "t6", text: "Widgets in pages", start: at(8), duration: 8, progress: 0, parent: "m1" }
  ]
}
