import { Effect, Option, Schema, Stream, SubscriptionRef } from "effect"
import type { Row } from "../core/rows"
import { zoned } from "../core/form"
import { stableJson } from "../model/model"
import { type Host as PluginHost, remoteGantt, remoteGrid, remoteKanban, remoteScheduler, remoteSelection, remoteTree, remoteValue } from "../model/remote"
import { TREE_KEY, type UiNode, UiNodeSchema } from "../model/tree"
import { Browser } from "./browser"
import { dataCollection, escapeHtml, renderDataView, renderGrid, renderList, renderTree, treeCollection } from "./data"
import { renderGantt } from "./gantt"
import { child, Host, keyed, swap, type Widget } from "./host"
import { renderCalendar, renderColorpicker, renderCombobox, renderSlider, renderTimepicker } from "./inputs"
import { renderKanban } from "./kanban"
import { reporting } from "./problems"
import { renderScheduler } from "./scheduler"

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
          if ("children" in node) yield* SubscriptionRef.set(children, node.children)
          const next = stableJson({ ...node, children: undefined, size: undefined })
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
