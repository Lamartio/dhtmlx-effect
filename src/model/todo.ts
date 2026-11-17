import { Effect, Schema, type Scope, type Stream, SubscriptionRef } from "effect"
import { changesOf, type Entry, history, type Input, input, recordInput } from "./model"

/**
 * The model of a To Do List: the tasks, the projects and the people, as one value. The list gives
 * all of it after each change of the user: that is the action `edit`.
 */

/** One task. A task with a `parent` is a subtask; `project` puts it in a project. */
export type TodoTask = {
  readonly id: string
  readonly text: string
  readonly checked?: boolean
  readonly parent?: string | null
  readonly project?: string | null
  readonly collapsed?: boolean
  readonly priority?: number | null
  readonly assigned?: ReadonlyArray<string>
  readonly due_date?: string | Date
  readonly [key: string]: unknown
}

export type TodoProject = { readonly id: string; readonly label: string }
export type TodoUser = { readonly id: string; readonly label: string; readonly avatar?: string; readonly color?: string }

/** What the list shows: the tasks, and the projects and the people that a task can name. */
export type TodoData = {
  readonly tasks: ReadonlyArray<TodoTask>
  readonly projects?: ReadonlyArray<TodoProject>
  readonly users?: ReadonlyArray<TodoUser>
}

const named = Schema.Struct({ id: Schema.String, label: Schema.String })
export const TodoDataSchema = Schema.Struct({
  tasks: Schema.Array(
    Schema.Record(Schema.String, Schema.Unknown).pipe(
      Schema.check(Schema.makeFilter((task: Readonly<Record<string, unknown>>) => (typeof task["id"] === "string" && typeof task["text"] === "string") || "A task needs an id and a text"))
    )
  ),
  projects: Schema.optional(Schema.Array(named)),
  users: Schema.optional(Schema.Array(Schema.Struct({ ...named.fields, avatar: Schema.optional(Schema.String), color: Schema.optional(Schema.String) })))
}) as unknown as Schema.Codec<TodoData>

/** True when each parent is a task, each project is a project, and each person assigned is a user. */
export const consistent = (data: TodoData) => {
  const tasks = new Set(data.tasks.map((task) => task.id))
  const projects = new Set((data.projects ?? []).map((project) => project.id))
  const users = new Set((data.users ?? []).map((user) => user.id))
  return data.tasks.every(
    (task) =>
      typeof task.id === "string" &&
      (task.parent == null || tasks.has(task.parent)) &&
      (task.project == null || projects.has(task.project)) &&
      (task.assigned ?? []).every((id) => users.has(id))
  )
}

export type TodoModel = {
  readonly data: SubscriptionRef.SubscriptionRef<TodoData>
  /** The data after a change in the list. Data that is not `consistent` is refused. */
  readonly edit: (data: TodoData) => Effect.Effect<boolean>
  readonly recent: Effect.Effect<ReadonlyArray<Entry>>
  readonly snapshot: Effect.Effect<{ readonly data: TodoData }>
  readonly changes: Stream.Stream<void>
}

/** The actions of a `TodoModel`, by name. */
export const TODO_ACTIONS = ["edit"] as const satisfies ReadonlyArray<keyof TodoModel>

export const todoModel = (options: { readonly data: Input<TodoData>; readonly history?: number }): Effect.Effect<TodoModel, never, Scope.Scope> =>
  Effect.gen(function* () {
    const data = yield* input<TodoData>(options.data, { tasks: [] })
    const log = yield* history(options.history ?? 0)
    yield* recordInput(log, "data", data)
    return {
      data,
      edit: (next) =>
        Effect.gen(function* () {
          if (!consistent(next)) return false
          yield* log.record({ _tag: "action", name: "edit", value: next })
          yield* SubscriptionRef.set(data, next)
          return true
        }),
      recent: log.recent,
      snapshot: Effect.map(SubscriptionRef.get(data), (now) => ({ data: now })),
      changes: changesOf(data)
    }
  })
