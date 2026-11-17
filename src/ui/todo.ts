import { ToDo } from "@dhtmlx/todolist"
import { Effect, Scope, SubscriptionRef } from "effect"
import { Browser, follow } from "./browser"
import { Host, resource } from "./host"
import { reportedCallback } from "./problems"
import { wxClear, wxThemeClass } from "./wx"
import type { TodoData, TodoProject, TodoTask } from "../model/todo"

export type { TodoData, TodoProject, TodoTask, TodoUser } from "../model/todo"

/** The actions of a person that change the tasks or the projects. */
const CHANGES = [
  "add-task", "update-task", "delete-task", "check-task", "uncheck-task", "move-task", "indent-task", "unindent-task",
  "clone-task", "paste-task", "collapse-task", "expand-task", "assign-user", "unassign-user",
  "add-project", "update-project", "delete-project"
] as const

/**
 * A DHTMLX To Do List in the host. The tasks are in `data`, both ways: a check, a new task, a new
 * text or a move by the user goes in, and a new value from the code shows in the list. The theme
 * follows `Browser.dark`.
 */
export const todo = (options: { readonly data: SubscriptionRef.SubscriptionRef<TodoData>; readonly readonly?: boolean }) =>
  Effect.gen(function* () {
    const host = yield* Host
    const browser = yield* Browser
    const view = yield* resource(
      "todo",
      () => new ToDo(host, { tasks: [], ...(options.readonly === true ? { readonly: true } : {}) } as never),
      (view) => {
        view.destructor()
        wxClear(host)
      }
    )
    // The value that the list has now: one that came from the list is not parsed again.
    let known: TodoData | undefined
    let applying = false
    yield* follow(options.data, (data) => {
      if (data === known) return
      known = data
      applying = true
      try {
        view.parse({
          tasks: data.tasks.map((task) => ({ ...task, ...(task.assigned === undefined ? {} : { assigned: [...task.assigned] }) })),
          projects: (data.projects ?? []).map((project) => ({ ...project })),
          users: (data.users ?? []).map((user) => ({ ...user }))
        } as never)
      } finally {
        applying = false
      }
    }, "The To Do List, while it followed its tasks")

    const write = yield* reportedCallback("The To Do List, on a change of a task", () => {
      if (applying) return
      const now = view.serialize()
      const before = Effect.runSync(SubscriptionRef.get(options.data))
      known = {
        tasks: (now.tasks ?? []) as unknown as ReadonlyArray<TodoTask>,
        ...(now.projects === undefined ? {} : { projects: now.projects as unknown as ReadonlyArray<TodoProject> }),
        ...(before.users === undefined ? {} : { users: before.users })
      }
      Effect.runSync(SubscriptionRef.set(options.data, known))
    })
    // The list calls back as the action starts: the tasks are read when it is done.
    let waiting = false
    const later = () => {
      if (applying || waiting) return
      waiting = true
      queueMicrotask(() => {
        waiting = false
        if (alive) write()
      })
    }
    let alive = true
    yield* Effect.addFinalizer(() => Effect.sync(() => (alive = false)))
    for (const name of CHANGES) view.api.on(name as never, later as never)

    yield* follow(browser.dark, (dark) => wxThemeClass(host, dark))
    return { todo: view, data: options.data }
  }) as Effect.Effect<{ readonly todo: ToDo; readonly data: SubscriptionRef.SubscriptionRef<TodoData> }, never, Host | Browser | Scope.Scope>
