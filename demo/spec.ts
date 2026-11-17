import { Effect, Exit, Scope, SubscriptionRef } from "effect"
import { type GridColumn, gridModel } from "../src/model/grid"
import { comboboxModel, sliderModel } from "../src/model/inputs"
import { type KanbanColumn, kanbanModel } from "../src/model/kanban"
import { stableJson } from "../src/model/model"
import { comboboxNode, gridNode, kanbanNode, sliderNode, type UiNode } from "../src/model/tree"
import { UiState } from "../src/model/ui-state"

/**
 * The file that the demo watches: the tree of the UI with the data in it. The plugin keeps a model
 * for each node by id: a node that stays keeps its model and gets the new data, a new node gets a
 * model, and a node that goes closes its model. The tree without the data goes to the page.
 */
/** A row of data: an id, and any fields. */
export type Data = { readonly id: string; readonly [field: string]: unknown }

export type Spec =
  | { readonly _tag: "column" | "row"; readonly id: string; readonly size?: number; readonly children: ReadonlyArray<Spec> }
  | { readonly _tag: "slider"; readonly id: string; readonly size?: number; readonly label?: string; readonly min?: number; readonly max?: number; readonly value: number }
  | { readonly _tag: "combobox"; readonly id: string; readonly size?: number; readonly label?: string; readonly options: ReadonlyArray<{ readonly value: string; readonly label: string }>; readonly value?: string }
  | { readonly _tag: "grid"; readonly id: string; readonly size?: number; readonly columns: ReadonlyArray<GridColumn>; readonly rows: ReadonlyArray<Data> }
  | { readonly _tag: "kanban"; readonly id: string; readonly size?: number; readonly field: string; readonly labelField: string; readonly columns: ReadonlyArray<KanbanColumn>; readonly rows: ReadonlyArray<Data> }

type Widget = Exclude<Spec, { readonly _tag: "column" | "row" }>
type Kept = { readonly tag: string; readonly scope: Scope.Closeable; readonly data: SubscriptionRef.SubscriptionRef<unknown>; last: string; node: UiNode }

/** The data of a node: what goes into its model, not into the tree. */
const dataOf = (spec: Widget): unknown => ("rows" in spec ? spec.rows : spec.value)

export const plugin = Effect.gen(function* () {
  const ui = yield* UiState
  const kept = new Map<string, Kept>()

  const make = (spec: Widget) =>
    Effect.gen(function* () {
      const scope = yield* Scope.make()
      const data = yield* SubscriptionRef.make<unknown>(dataOf(spec))
      const { _tag, id, ...config } = spec as Widget & { readonly rows?: unknown; readonly value?: unknown }
      const { rows: _rows, value: _value, ...view } = config
      const node = yield* Effect.gen(function* () {
        switch (spec._tag) {
          case "slider":
            return yield* sliderNode(id, yield* sliderModel({ value: data as never, ...(spec.min === undefined ? {} : { min: spec.min }) }), view)
          case "combobox":
            return yield* comboboxNode(id, yield* comboboxModel({ value: data as never, options: spec.options }), view as never)
          case "grid":
            return yield* gridNode(id, yield* gridModel({ columns: spec.columns, rows: data as never }), view as never)
          case "kanban":
            return yield* kanbanNode(id, yield* kanbanModel({ rows: data as never, field: spec.field as never, columns: spec.columns }), view as never)
        }
      }).pipe(Scope.provide(scope), Effect.provideService(UiState, ui))
      return { tag: _tag, scope, data, last: stableJson(dataOf(spec)), node: node as UiNode }
    })

  /** One node of the spec as a node of the tree, with its model made or kept. */
  const visit = (spec: Spec, seen: Set<string>): Effect.Effect<UiNode> =>
    Effect.gen(function* () {
      seen.add(spec.id)
      if (spec._tag === "column" || spec._tag === "row") {
        const children: Array<UiNode> = []
        for (const one of spec.children) children.push(yield* visit(one, seen))
        return { _tag: spec._tag, id: spec.id, children, ...(spec.size === undefined ? {} : { size: spec.size }) }
      }
      const widget = spec as Widget
      const was = kept.get(spec.id)
      const { rows: _rows, value: _value, ...node } = widget as Widget & { readonly rows?: unknown; readonly value?: unknown }
      if (was !== undefined && was.tag === spec._tag) {
        // The model stays: only new data goes in, so a change of the user stays until the file changes that data.
        const data = stableJson(dataOf(widget))
        if (data !== was.last) {
          was.last = data
          yield* SubscriptionRef.set(was.data, dataOf(widget))
        }
        was.node = node as UiNode
        return was.node
      }
      if (was !== undefined) yield* Scope.close(was.scope, Exit.void)
      const made = yield* make(widget)
      kept.set(spec.id, made)
      return made.node
    })

  const tree = yield* SubscriptionRef.make<UiNode>({ _tag: "column", id: "empty", children: [] })

  /** Takes a new spec: keeps, makes and closes models, then sends the tree. */
  const load = (spec: Spec) =>
    Effect.gen(function* () {
      const seen = new Set<string>()
      const next = yield* visit(spec, seen)
      for (const [id, one] of kept) {
        if (seen.has(id)) continue
        kept.delete(id)
        yield* Scope.close(one.scope, Exit.void)
      }
      yield* SubscriptionRef.set(tree, next)
    })

  return { tree, load }
})
