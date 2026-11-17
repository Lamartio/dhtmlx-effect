import { Effect, Option, Schema, Stream, SubscriptionRef } from "effect"
import type { Row } from "../core/rows"
import { zoned } from "../core/form"
import { stableJson } from "../model/model"
import { type Host as PluginHost, remoteGantt, remoteModel, remoteGrid, remoteKanban, remoteScheduler, remoteSelection, remoteTree, remoteValue } from "../model/remote"
import { CELLS_ACTIONS, childrenOf, TREE_KEY, type UiNode, UiNodeSchema } from "../model/tree"
import { Browser } from "./browser"
import { dataCollection, escapeHtml, renderDataView, renderGrid, renderList, renderTree, treeCollection } from "./data"
import { renderGantt } from "./gantt"
import { child, Host, keyed, swap, type Widget } from "./host"
import { renderCalendar, renderColorpicker, renderCombobox, renderSlider, renderTimepicker } from "./inputs"
import { renderKanban } from "./kanban"
import { reporting } from "./problems"
import { renderScheduler } from "./scheduler"
import { layout } from "./layout"
import { sidebar } from "./sidebar"
import { tabbar } from "./tabbar"

// A node decoded from JSON has no key with `undefined` in it, so its config fits the options of a
// renderer, which do not take `undefined` (`exactOptionalPropertyTypes`): hence the casts below.

/**
 * The page side of a plugin: draws the tree of nodes that the plugin sends (`TREE_KEY` in the
 * document), with a widget on a remote model for each node. A node that changes only its state
 * changes in place; a node that changes its kind or its config is made again; a node that goes
 * closes its widget. The children of a frame are keyed by id.
 */

const decode = Schema.decodeUnknownOption(UiNodeSchema as never) as (value: unknown) => Option.Option<UiNode>

/** The text of the `fields` of a row, one after the other, escaped. */
const fieldsTemplate = (fields: ReadonlyArray<string>) => (item: Record<string, unknown>) =>
  fields.map((field) => `<span class="dhxe-field">${escapeHtml(item[field] ?? "")}</span>`).join(" ")

/** The widget of one node, in the host of the node. */
const widgetOf = (page: PluginHost, node: UiNode, children: SubscriptionRef.SubscriptionRef<ReadonlyArray<UiNode>>): Widget =>
  Effect.gen(function* () {
    switch (node._tag) {
      case "column":
      case "row": {
        const host = yield* Host
        host.style.display = "flex"
        host.style.flexDirection = node._tag
        host.style.minHeight = "0"
        host.style.minWidth = "0"
        return yield* keyed(children, (one) => one.id, (one) => nodePart(page, one, node._tag))
      }
      case "tabbar":
        return yield* tabsOf(page, node, children)
      case "sidebar":
        return yield* sidebarOf(page, node, children)
      case "layout":
        return yield* layoutOf(page, node, children)
      case "calendar":
        return yield* renderCalendar(yield* remoteValue<string | undefined>(page, node.id, undefined))
      case "timepicker":
        return yield* renderTimepicker(yield* remoteValue(page, node.id, "09:00"))
      case "slider":
        return yield* renderSlider(yield* remoteValue(page, node.id, node.min ?? 0), node as never)
      case "colorpicker":
        return yield* renderColorpicker(yield* remoteValue(page, node.id, "#2e7dd1"))
      case "combobox":
        return yield* renderCombobox(yield* remoteValue<string | undefined>(page, node.id, undefined), node as never)
      case "grid": {
        const model = yield* remoteGrid(page, node.id)
        return yield* renderGrid(model, { data: yield* dataCollection(model.rows), columns: node.columns as never })
      }
      case "list": {
        const model = yield* remoteSelection(page, node.id)
        return yield* renderList(model, { data: yield* dataCollection(model.rows), template: fieldsTemplate(node.fields), ...(node.itemHeight === undefined ? {} : { itemHeight: node.itemHeight }) })
      }
      case "dataview": {
        const model = yield* remoteSelection(page, node.id)
        return yield* renderDataView(model, { data: yield* dataCollection(model.rows), template: fieldsTemplate(node.fields), ...(node.itemsInRow === undefined ? {} : { itemsInRow: node.itemsInRow }) })
      }
      case "tree": {
        const model = yield* remoteTree(page, node.id)
        return yield* renderTree(model, { data: yield* treeCollection(model.rows) })
      }
      case "gantt":
        return yield* renderGantt(yield* remoteGantt(page, node.id))
      case "scheduler": {
        const browser = yield* Browser
        const today = zoned(yield* SubscriptionRef.get(browser.now), yield* SubscriptionRef.get(browser.timeZone)).day
        return yield* renderScheduler(yield* remoteScheduler(page, node.id, today))
      }
      case "kanban": {
        const text = (row: Row, field: string | undefined) => (field === undefined ? undefined : String((row as unknown as Record<string, unknown>)[field] ?? ""))
        return yield* renderKanban(yield* remoteKanban<Row>(page, node.id), {
          field: node.field as never,
          columns: node.columns as never,
          ...(node.lanes === undefined ? {} : { lanes: node.lanes as never }),
          label: (row) => text(row, node.labelField) ?? "",
          description: (row) => text(row, node.descriptionField)
        })
      }
    }
  })

/**
 * The shape of a node: all of it but its size and its children, where a child is only its id. A node
 * with the same shape keeps its widget; its children change in place.
 */
const shapeOf = (node: UiNode) =>
  JSON.stringify({ ...node, size: undefined }, (key, value: unknown) =>
    key === "child" ? (value as UiNode).id : key === "children" ? (value as ReadonlyArray<UiNode>).map((one) => one.id) : value)

/**
 * A ref for each child of a node, by id, that follows the children as they change, so the part of
 * a child changes in place.
 */
const childRefs = (node: UiNode, children: SubscriptionRef.SubscriptionRef<ReadonlyArray<UiNode>>) =>
  Effect.gen(function* () {
    const refs = new Map<string, SubscriptionRef.SubscriptionRef<UiNode>>()
    for (const one of childrenOf(node)) refs.set(one.id, yield* SubscriptionRef.make(one))
    yield* SubscriptionRef.changes(children).pipe(
      Stream.runForEach((all) =>
        Effect.forEach(all, (one) => {
          const ref = refs.get(one.id)
          return ref === undefined ? Effect.void : Effect.flatMap(SubscriptionRef.get(ref), (now) => (stableJson(now) === stableJson(one) ? Effect.void : SubscriptionRef.set(ref, one)))
        }, { discard: true })),
      reporting(`The children of ${node.id} of the plugin`),
      Effect.forkScoped
    )
    return refs
  })

/**
 * The chosen child of tabs or a sidebar, both ways: a click sets `active`, which goes to the plugin
 * as `set`; the value of the plugin comes back into `active`, also after a refusal.
 */
const chosen = (page: PluginHost, id: string, first: string) =>
  Effect.gen(function* () {
    const model = yield* remoteValue<string>(page, id, first)
    const active = yield* SubscriptionRef.make(yield* SubscriptionRef.get(model.value))
    yield* SubscriptionRef.changes(model.value).pipe(
      Stream.runForEach((value) => Effect.flatMap(SubscriptionRef.get(active), (now) => (now === value ? Effect.void : SubscriptionRef.set(active, value)))),
      Effect.forkScoped
    )
    yield* SubscriptionRef.changes(active).pipe(
      Stream.runForEach((value) => Effect.flatMap(SubscriptionRef.get(model.value), (now) => (now === value ? Effect.void : model.set(value)))),
      Effect.forkScoped
    )
    return active
  })

/** A part that fills its host as a flex column with no scroll, as the root does: for the pane of a tab. */
const fill = <A, E, R>(part: Effect.Effect<A, E, R>) =>
  Effect.gen(function* () {
    const host = yield* Host
    host.style.display = "flex"
    host.style.flexDirection = "column"
    host.style.overflow = "hidden"
    return yield* part
  })

/** A Tabbar for a tabbar node: only the open tab is drawn. */
const tabsOf = (page: PluginHost, node: Extract<UiNode, { readonly _tag: "tabbar" }>, children: SubscriptionRef.SubscriptionRef<ReadonlyArray<UiNode>>) =>
  Effect.gen(function* () {
    const refs = yield* childRefs(node, children)
    return yield* tabbar({
      active: yield* chosen(page, node.id, node.tabs[0]?.child.id ?? ""),
      items: node.tabs.map((tab) => ({ id: tab.child.id, label: tab.label, part: fill(nodePart(page, refs.get(tab.child.id)!, "column")) }))
    })
  })

/** A Sidebar for a sidebar node: only the chosen item is drawn. */
const sidebarOf = (page: PluginHost, node: Extract<UiNode, { readonly _tag: "sidebar" }>, children: SubscriptionRef.SubscriptionRef<ReadonlyArray<UiNode>>) =>
  Effect.gen(function* () {
    const refs = yield* childRefs(node, children)
    return yield* sidebar({
      active: yield* chosen(page, node.id, node.items[0]?.child.id ?? ""),
      ...(node.width === undefined ? {} : { width: node.width }),
      items: node.items.map((item) => ({
        id: item.child.id,
        label: item.label,
        ...(item.icon === undefined ? {} : { icon: item.icon }),
        part: fill(nodePart(page, refs.get(item.child.id)!, "column"))
      }))
    })
  })

/** A Layout for a layout node: a cell for each child, and the hidden cells of the model in the plugin. */
const layoutOf = (page: PluginHost, node: Extract<UiNode, { readonly _tag: "layout" }>, children: SubscriptionRef.SubscriptionRef<ReadonlyArray<UiNode>>) =>
  Effect.gen(function* () {
    const refs = yield* childRefs(node, children)
    const model = yield* remoteModel(page, node.id, { hidden: [] as ReadonlyArray<string> }, CELLS_ACTIONS)
    const cells = []
    for (const cell of node.cells) {
      const id = cell.child.id
      const hidden = yield* SubscriptionRef.make((yield* SubscriptionRef.get(model.hidden)).includes(id))
      yield* SubscriptionRef.changes(model.hidden).pipe(
        Stream.runForEach((all) => Effect.flatMap(SubscriptionRef.get(hidden), (now) => (now === all.includes(id) ? Effect.void : SubscriptionRef.set(hidden, all.includes(id))))),
        Effect.forkScoped
      )
      cells.push({
        id,
        hidden,
        part: fill(nodePart(page, refs.get(id)!, node.direction === "rows" ? "column" : "row")),
        ...(cell.header === undefined ? {} : { header: cell.header }),
        ...(cell.size === undefined ? {} : node.direction === "rows" ? { height: cell.size } : { width: cell.size }),
        ...(cell.resizable === undefined ? {} : { resizable: cell.resizable }),
        ...(cell.collapsable === undefined ? {} : { collapsable: cell.collapsable })
      })
    }
    return yield* layout({ direction: node.direction, cells, ...(node.type === undefined ? {} : { type: node.type }) })
  })

/**
 * One node in its own element, sized along its frame. Its widget is made again only when its kind or
 * its config changes (all but the children); new children go into the keyed list of a frame.
 */
const nodePart = (page: PluginHost, item: SubscriptionRef.SubscriptionRef<UiNode>, frame: "column" | "row") =>
  Effect.gen(function* () {
    const element = yield* child("dhxe-node")
    const show = yield* swap
    const children = yield* SubscriptionRef.make<ReadonlyArray<UiNode>>([])
    let shape: string | undefined
    yield* SubscriptionRef.changes(item).pipe(
      Stream.runForEach((node) =>
        Effect.gen(function* () {
          const size = node.size
          element.style.flex = size === undefined ? "1 1 0" : `0 0 ${size}px`
          element.style[frame === "column" ? "minHeight" : "minWidth"] = "0"
          element.style.position = "relative"
          element.style.display = "flex"
          element.style.flexDirection = "column"
          yield* SubscriptionRef.set(children, childrenOf(node))
          const next = shapeOf(node)
          if (next === shape) return
          shape = next
          yield* show(widgetOf(page, node, children).pipe(Effect.provideService(Host, element)))
        })),
      reporting(`The node ${Effect.runSync(SubscriptionRef.get(item)).id} of the plugin`),
      Effect.forkScoped
    )
  })

/** Draws the UI of the plugin behind `page` in the host, filling it. */
export const renderPlugin = (page: PluginHost): Widget =>
  Effect.gen(function* () {
    const roots = yield* SubscriptionRef.make<ReadonlyArray<UiNode>>([])
    yield* SubscriptionRef.changes(page.document).pipe(
      Stream.map((document) => decode(document[TREE_KEY])),
      Stream.changesWith((a, b) => stableJson(a) === stableJson(b)),
      Stream.runForEach((tree) => SubscriptionRef.set(roots, Option.isSome(tree) ? [tree.value] : [])),
      reporting("The tree of the plugin"),
      Effect.forkScoped
    )
    // The root fills its host as a flex column, with no scroll: the app sizes the host (in the demo,
    // the whole window), and each node takes its `size` or a part of what is left.
    const host = yield* Host
    host.style.display = "flex"
    host.style.flexDirection = "column"
    host.style.minHeight = "0"
    host.style.overflow = "hidden"
    yield* keyed(roots, (node) => node.id, (node) => nodePart(page, node, "column"))
  })
