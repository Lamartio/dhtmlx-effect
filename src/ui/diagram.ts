import { Diagram, DiagramEditor, setTheme } from "@dhtmlx/diagram"
import type { DiagramType, IDiagramConfig } from "@dhtmlx/diagram/codebase/types/ts-diagram/sources/types"
import { Effect, Option, PubSub, Scope, Stream, SubscriptionRef } from "effect"
import { Browser, follow } from "./browser"
import { Host, resource } from "./host"
import { reportedCallback, reporting } from "./problems"

export type { DiagramType } from "@dhtmlx/diagram/codebase/types/ts-diagram/sources/types"

/**
 * One item of a diagram, as DHTMLX takes it: a shape, a line, a group or a swimlane. A shape of an
 * org chart or a mind map names its `parent`; a line names `from` and `to`.
 */
export type DiagramItem = { readonly id?: string; readonly type?: string; readonly text?: string; readonly parent?: string | null; readonly [key: string]: unknown }

/** The tasks and the links of a PERT chart. */
export type PertData = { readonly data: ReadonlyArray<DiagramItem>; readonly links: ReadonlyArray<DiagramItem> }

/** What a diagram shows: a list of items, or the tasks and links of a PERT chart. */
export type DiagramData = ReadonlyArray<DiagramItem> | PertData

type Collection = {
  readonly parse: (data: unknown) => unknown
  readonly removeAll: () => void
  readonly add: (item: object) => unknown
  readonly update: (id: string, fields: object) => void
  readonly remove: (id: string) => void
  readonly exists: (id: string) => boolean
}

/** The items by id, when the data is a list and each item has an id. Else undefined: the diagram is parsed again. */
const byId = (data: DiagramData): ReadonlyMap<string, DiagramItem> | undefined => {
  if (!Array.isArray(data)) return undefined
  const items = data as ReadonlyArray<DiagramItem>
  const map = new Map<string, DiagramItem>()
  for (const item of items) {
    if (item.id === undefined || map.has(item.id)) return undefined
    map.set(item.id, item)
  }
  return map
}

const sameItem = (a: DiagramItem, b: DiagramItem) => {
  const keys = Object.keys(a)
  return keys.length === Object.keys(b).length && keys.every((key) => a[key] === b[key])
}

/** A copy for DHTMLX, as it writes into the objects it gets. */
const copy = (data: DiagramData): unknown =>
  Array.isArray(data)
    ? (data as ReadonlyArray<DiagramItem>).map((item) => ({ ...item }))
    : { data: (data as PertData).data.map((item) => ({ ...item })), links: (data as PertData).links.map((item) => ({ ...item })) }

/**
 * Shows `after` in the collection. When both lists have an id on each item, only the changes go in,
 * by id: the scroll, the selection and the folded branches stay. Else all is parsed again.
 */
const show = (collection: Collection, before: DiagramData | undefined, after: DiagramData) => {
  const old = before === undefined ? undefined : byId(before)
  const next = byId(after)
  if (old === undefined || next === undefined) {
    collection.removeAll()
    collection.parse(copy(after))
    return
  }
  for (const id of old.keys()) if (!next.has(id) && collection.exists(id)) collection.remove(id)
  for (const [id, item] of next) {
    const was = old.get(id)
    if (was === undefined) collection.add({ ...item })
    else if (!sameItem(was, item)) {
      const { id: _, ...fields } = item
      collection.update(id, fields)
    }
  }
}

const idOf = (value: unknown): string | undefined => {
  const id = typeof value === "object" && value !== null ? (value as { readonly id?: unknown }).id : value
  return id === undefined || id === null ? undefined : String(id)
}

export type DiagramOptions = {
  /** `default` for flowcharts and block diagrams, `org` for an org chart, `mindmap`, or `pert`. Default: `default`. */
  readonly type?: DiagramType
  /** The items. The diagram shows each change. */
  readonly data: SubscriptionRef.SubscriptionRef<DiagramData>
  /** The id of the selected item, both ways. */
  readonly selected?: SubscriptionRef.SubscriptionRef<string | undefined>
  /** More of the config of DHTMLX, such as `defaults`, `lineConfig`, `scale` or `autoplacement`. */
  readonly config?: Omit<IDiagramConfig, "type">
}

/**
 * A DHTMLX Diagram in the host: a flowchart, an org chart, a mind map or a PERT chart, by `type`.
 * It only shows: the items come from the store, and a person changes them in `diagramEditor`. Gives
 * the clicks on shapes as a stream of ids, and the selected item both ways. The theme follows
 * `Browser.dark`.
 */
export const diagram = (options: DiagramOptions) =>
  Effect.gen(function* () {
    const host = yield* Host
    const browser = yield* Browser
    const selected = options.selected ?? (yield* SubscriptionRef.make<string | undefined>(undefined))
    const clicks = yield* Effect.acquireRelease(PubSub.unbounded<string>(), PubSub.shutdown)
    const view = yield* resource(
      "diagram",
      () => new Diagram(host, { select: true, ...options.config, type: options.type ?? "default" }),
      (view) => view.destructor()
    )
    const collection = view.data as unknown as Collection
    yield* SubscriptionRef.changes(options.data).pipe(
      Stream.zipWithPrevious,
      Stream.runForEach(([before, after]) => Effect.sync(() => show(collection, Option.getOrUndefined(before), after))),
      reporting("The Diagram, while it showed its items"),
      Effect.forkScoped
    )

    // A select that came from the ref is not sent back.
    let applying = false
    const select = (id: string | undefined) => {
      if (!applying && Effect.runSync(SubscriptionRef.get(selected)) !== id) Effect.runSync(SubscriptionRef.set(selected, id))
    }
    const onClick = yield* reportedCallback("The Diagram, on a click", (id: unknown) => {
      const shape = idOf(id)
      if (shape !== undefined) Effect.runSync(PubSub.publish(clicks, shape))
    })
    const onSelect = yield* reportedCallback("The Diagram, on a select", (item: unknown) => select(idOf(item)))
    const onUnselect = yield* reportedCallback("The Diagram, on an unselect", () => select(idOf(view.selection.getIds()[0])))
    yield* resource(
      "listener",
      () => {
        view.events.on("shapeClick" as never, onClick as never)
        view.events.on("afterselect" as never, onSelect as never)
        view.events.on("afterunselect" as never, onUnselect as never)
      },
      () => {
        view.events.detach("shapeClick" as never)
        view.events.detach("afterselect" as never)
        view.events.detach("afterunselect" as never)
      }
    )
    yield* follow(selected, (id) => {
      if (id === idOf(view.selection.getIds()[0])) return
      applying = true
      try {
        view.selection.clear()
        if (id !== undefined && collection.exists(id)) view.selection.add({ id })
      } finally {
        applying = false
      }
    }, "The Diagram, while it followed the selected item")
    yield* follow(browser.dark, (dark) => setTheme(dark ? "dark" : "light", host))
    return { diagram: view, selected, clicks: Stream.fromPubSub(clicks) }
  }) as Effect.Effect<
    { readonly diagram: Diagram; readonly selected: SubscriptionRef.SubscriptionRef<string | undefined>; readonly clicks: Stream.Stream<string> },
    never,
    Host | Browser | Scope.Scope
  >

export type DiagramEditorOptions = {
  /** The kind of diagram that the editor makes. Default: `default`. */
  readonly type?: Exclude<DiagramType, "pert">
  /** The items, both ways: the editor shows them, and each change of a person goes back. */
  readonly data: SubscriptionRef.SubscriptionRef<ReadonlyArray<DiagramItem>>
}

/**
 * The DHTMLX Diagram Editor in the host: a person draws and changes a diagram, with a toolbar, a
 * bar of shapes and a bar of properties. Each change goes into `data`, and a new value of `data`
 * from the code shows in the editor. Give the host a height. The theme follows `Browser.dark`.
 */
export const diagramEditor = (options: DiagramEditorOptions) =>
  Effect.gen(function* () {
    const host = yield* Host
    const browser = yield* Browser
    const view = yield* resource(
      "diagram editor",
      () => new DiagramEditor(host, { type: options.type ?? "default" } as never),
      (view) => view.destructor()
    )
    // The value that the editor has now: one that came from the editor is not parsed again.
    let known: ReadonlyArray<DiagramItem> | undefined
    let applying = false
    yield* follow(options.data, (items) => {
      if (items === known) return
      known = items
      applying = true
      try {
        view.parse(items.map((item) => ({ ...item })) as never)
      } finally {
        applying = false
      }
    }, "The Diagram Editor, while it followed its items")
    const onChange = yield* reportedCallback("The Diagram Editor, on a change", () => {
      if (applying) return
      known = view.serialize() as unknown as ReadonlyArray<DiagramItem>
      Effect.runSync(SubscriptionRef.set(options.data, known))
    })
    // The data events of the diagram inside the editor, and of the editor itself: they are not one
    // event system in each version, and a second call with the same items changes nothing.
    const systems = [...new Set([view.events, view.diagram.events] as ReadonlyArray<{ readonly on: (name: never, f: never) => void; readonly detach: (name: never) => void }>)]
    yield* resource(
      "listener",
      () => {
        for (const events of systems) for (const name of ["change", "afteradd", "afterremove"]) events.on(name as never, onChange as never)
      },
      () => {
        for (const events of systems) for (const name of ["change", "afteradd", "afterremove"]) events.detach(name as never)
      }
    )
    yield* follow(browser.dark, (dark) => setTheme(dark ? "dark" : "light", host))
    return { editor: view, data: options.data }
  }) as Effect.Effect<
    { readonly editor: DiagramEditor; readonly data: SubscriptionRef.SubscriptionRef<ReadonlyArray<DiagramItem>> },
    never,
    Host | Browser | Scope.Scope
  >
