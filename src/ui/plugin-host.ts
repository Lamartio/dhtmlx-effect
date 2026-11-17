import { Effect, Fiber, Match, Option, Schema, type Scope, Stream, SubscriptionRef } from "effect"
import type { Row } from "../core/rows"
import { zoned } from "../core/form"
import { stableJson } from "../model/model"
import { type Host as PluginHost, remoteWindow, remoteFilePicker, remoteVault, remoteBooking, remotePivot, remoteSpreadsheet, remoteChart, remoteClicks, remoteDiagram, remoteForm, remoteGantt, remoteModel, remoteGrid, remoteKanban, remoteScheduler, remoteSelection, remoteTodo, remoteTree, remoteValue } from "../model/remote"
import { STATES } from "../model/states"
import { CELLS_ACTIONS, childrenOf, TREE_KEY, type UiNode, UiNodeSchema } from "../model/tree"
import { Browser } from "./browser"
import { dataCollection, escapeHtml, renderDataView, renderGrid, renderList, renderTree, treeCollection } from "./data"
import { renderGantt } from "./gantt"
import { child, Host, keyed, swap, type Widget } from "./host"
import { renderCalendar, renderColorpicker, renderCombobox, renderSlider, renderTimepicker } from "./inputs"
import { renderKanban } from "./kanban"
import { reporting } from "./problems"
import { renderScheduler } from "./scheduler"
import { button } from "./button"
import { chart } from "./chart"
import { datepicker } from "./datepicker"
import { diagram, diagramEditor } from "./diagram"
import { richtext } from "./richtext"
import { booking } from "./booking"
import { filePicker } from "./filepicker"
import { openWindow } from "./overlay"
import { Dialogs, layerDialogsLive, tooltipOn } from "./dialogs"
import type { AskMessage } from "../model/ui-state"
import { vault } from "./vault"
import { MAX_FILE_BYTES } from "../model/files"
import { pivot } from "./pivot"
import { spreadsheet } from "./spreadsheet"
import { todo } from "./todo"
import { renderForm } from "./form"
import { layout } from "./layout"
import { gridContextMenu, menu, ribbon } from "./menus"
import { toolbar, toolbarButton, toolbarSeparator, toolbarSpacer, toolbarTitle } from "./toolbar"
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
    /** A column or a row: a flex frame with its children keyed by id. */
    const frame = (tag: "column" | "row") =>
      Effect.gen(function* () {
        const host = yield* Host
        host.style.display = "flex"
        host.style.flexDirection = tag
        host.style.minHeight = "0"
        host.style.minWidth = "0"
        return yield* keyed(children, (one) => one.id, (one) => nodePart(page, one, tag))
      })
    // Each kind of node has its widget here: Match.valueTags makes a kind that is missing a type error.
    return yield* Match.valueTags(node, {
      column: () => frame("column"),
      row: () => frame("row"),
      tabbar: (node) => tabsOf(page, node, children),
      sidebar: (node) => sidebarOf(page, node, children),
      layout: (node) => layoutOf(page, node, children),
      window: (node) => windowOf(page, node, children),
      calendar: (node) => Effect.flatMap(remoteValue<string | undefined>(page, node.id, undefined, STATES.calendar), renderCalendar),
      timepicker: (node) => Effect.flatMap(remoteValue(page, node.id, "09:00", STATES.timepicker), renderTimepicker),
      slider: (node) => Effect.flatMap(remoteValue(page, node.id, node.min ?? 0, STATES.slider), (model) => renderSlider(model, node as never)),
      colorpicker: (node) => Effect.flatMap(remoteValue(page, node.id, "#2e7dd1", STATES.colorpicker), renderColorpicker),
      combobox: (node) => Effect.flatMap(remoteValue<string | undefined>(page, node.id, undefined, STATES.combobox), (model) => renderCombobox(model, node as never)),
      grid: (node) =>
        Effect.gen(function* () {
          const model = yield* remoteGrid(page, node.id)
          const made = yield* renderGrid(model, { data: yield* dataCollection(model.rows), columns: node.columns as never })
          const menu = node.menu
          if (menu !== undefined && menu.length > 0) {
            const choices = yield* gridContextMenu(made.grid, () => menu as never)
            yield* choices.pipe(Stream.runForEach(({ row, choice }) => model.choose(row, choice)), reporting(`The menu of ${node.id}`), Effect.forkScoped)
          }
          return made
        }),
      form: (node) => Effect.flatMap(remoteForm(page, node.id), (model) => renderForm(model, { fields: node.fields as never, ...(node.submitLabel === undefined ? {} : { submitLabel: node.submitLabel }) })),
      datepicker: (node) =>
        Effect.gen(function* () {
          return yield* datepicker({
            value: yield* chosen<string | undefined>(page, node.id, undefined),
            ...(node.label === undefined ? {} : { label: node.label }),
            ...(node.placeholder === undefined ? {} : { placeholder: node.placeholder })
          })
        }),
      diagram: (node) =>
        Effect.gen(function* () {
          const model = yield* remoteDiagram(page, node.id)
          if (node.editor === true) {
            // The editor gives all the items after each change: that is the action `edit`.
            return yield* diagramEditor({ data: (yield* bridge(model.items, model.edit)) as never, ...(node.type === undefined ? {} : { type: node.type }) })
          }
          const made = yield* diagram({
            data: model.items as never,
            selected: yield* bridge(model.selected, model.select),
            ...(node.type === undefined ? {} : { type: node.type }),
            ...(node.config === undefined ? {} : { config: node.config as never })
          })
          yield* made.clicks.pipe(Stream.runForEach((id) => model.click(id)), reporting(`The diagram ${node.id}`), Effect.forkScoped)
          return made
        }),
      richtext: (node) =>
        Effect.gen(function* () {
          const model = yield* remoteValue(page, node.id, "", STATES.richtext)
          const options = Object.fromEntries(Object.entries({ format: node.format, toolbar: node.toolbar, menubar: node.menubar, readOnly: node.readOnly }).filter(([, value]) => value !== undefined))
          return yield* richtext({ ...options, value: yield* bridge(model.value, model.set) })
        }),
      todo: (node) =>
        Effect.gen(function* () {
          const model = yield* remoteTodo(page, node.id)
          return yield* todo({ data: yield* bridge(model.data, model.edit), ...(node.readonly === undefined ? {} : { readonly: node.readonly }) })
        }),
      booking: (node) =>
        Effect.gen(function* () {
          const model = yield* remoteBooking(page, node.id)
          const made = yield* booking({ cards: model.cards, ...(node.start === undefined ? {} : { start: new Date(node.start) }), ...(node.end === undefined ? {} : { end: new Date(node.end) }) })
          yield* made.confirmed.pipe(Stream.runForEach((slot) => model.book(slot.card, slot.start.getTime(), slot.minutes, slot.form)), reporting(`The booking ${node.id}`), Effect.forkScoped)
          return made
        }),
      pivot: (node) =>
        Effect.gen(function* () {
          const model = yield* remotePivot(page, node.id)
          return yield* pivot({ rows: model.rows, fields: node.fields, config: yield* bridge(model.config, model.configure), ...(node.configPanel === undefined ? {} : { configPanel: node.configPanel }) })
        }),
      spreadsheet: (node) =>
        Effect.gen(function* () {
          const model = yield* remoteSpreadsheet(page, node.id)
          const { _tag, id: _id, size: _size, ...options } = node
          return yield* spreadsheet({ ...(options as object), data: yield* bridge(model.data, model.edit) })
        }),
      vault: (node) =>
        Effect.gen(function* () {
          const model = yield* remoteVault(page, node.id)
          const max = node.maxSize ?? MAX_FILE_BYTES
          const made = yield* vault({ ...(node.mode === undefined ? {} : { mode: node.mode }), ...(node.toolbar === undefined ? {} : { toolbar: node.toolbar }) })
          // The files that the page sends now: the state of the plugin does not take them out yet.
          // ponytail: a change of the state between a send and its answer can take out a file in flight; track the answers if that shows.
          const sending = new Set<string>()
          let shown = new Set<string>()
          yield* SubscriptionRef.changes(made.files).pipe(
            Stream.runForEach((files) =>
              Effect.gen(function* () {
                const now = new Set(files.map((file) => file.id))
                const known = new Set((yield* SubscriptionRef.get(model.files)).map((file) => file.id))
                for (const file of files) {
                  if (shown.has(file.id) || known.has(file.id) || file.file === undefined) continue
                  sending.add(file.id)
                  yield* Effect.forkScoped(Effect.gen(function* () {
                    const bytes = file.size <= max ? yield* Effect.promise(() => file.file!.arrayBuffer()) : new ArrayBuffer(0)
                    sending.delete(file.id)
                    yield* model.add({ id: file.id, name: file.name, size: file.size, type: file.file!.type, bytes })
                  }))
                }
                for (const id of shown) if (!now.has(id) && known.has(id)) yield* model.remove(id)
                shown = now
              })),
            reporting(`The vault ${node.id}`),
            Effect.forkScoped
          )
          yield* SubscriptionRef.changes(model.files).pipe(
            Stream.runForEach((files) =>
              Effect.sync(() => {
                const ids = new Set(files.map((file) => file.id))
                const data = made.vault.data as unknown as { readonly serialize: () => ReadonlyArray<{ readonly id: string }>; readonly remove: (id: string) => void; readonly update: (id: string, fields: object) => void; readonly add: (item: object) => void; readonly exists: (id: string) => boolean }
                for (const item of data.serialize()) if (!ids.has(item.id) && !sending.has(item.id)) data.remove(item.id)
                for (const file of files) {
                  if (!data.exists(file.id)) data.add({ ...file })
                  else data.update(file.id, { status: file.status, progress: file.progress })
                }
              })),
            reporting(`The vault ${node.id}`),
            Effect.forkScoped
          )
          return made
        }),
      filepicker: (node) =>
        Effect.gen(function* () {
          const model = yield* remoteFilePicker(page, node.id)
          const max = node.maxSize ?? MAX_FILE_BYTES
          const made = yield* filePicker(Object.fromEntries(Object.entries({ label: node.label, accept: node.accept, multiple: node.multiple }).filter(([, value]) => value !== undefined)))
          yield* made.picked.pipe(
            Stream.runForEach((file) =>
              Effect.flatMap(file.size <= max ? Effect.promise(() => file.arrayBuffer()) : Effect.succeed(new ArrayBuffer(0)), (bytes) =>
                model.pick({ id: crypto.randomUUID(), name: file.name, size: file.size, type: file.type, bytes }))),
            reporting(`The file picker ${node.id}`),
            Effect.forkScoped
          )
          return made
        }),
      chart: (node) =>
        Effect.gen(function* () {
          const model = yield* remoteChart(page, node.id)
          const made = yield* chart({ data: yield* dataCollection(model.rows), config: node.config as never })
          // The series that the Chart hides now; a toggle that came from the plugin is not sent back.
          const shown = new Set<string>()
          let applying = false
          yield* made.toggled.pipe(
            Stream.runForEach((id) =>
              Effect.gen(function* () {
                if (applying) return
                if (shown.has(id)) shown.delete(id)
                else shown.add(id)
                yield* model.toggle(id)
              })),
            reporting(`The chart ${node.id}`),
            Effect.forkScoped
          )
          yield* made.clicks.pipe(Stream.runForEach(({ series, row }) => model.click(series, row)), reporting(`The chart ${node.id}`), Effect.forkScoped)
          yield* SubscriptionRef.changes(model.hidden).pipe(
            Stream.runForEach((hidden) =>
              Effect.sync(() => {
                const wanted = new Set(hidden)
                for (const id of new Set([...wanted, ...shown])) {
                  if (wanted.has(id) === shown.has(id)) continue
                  applying = true
                  try {
                    made.chart.getSeries(id)?.toggle()
                    made.chart.paint()
                  } finally {
                    applying = false
                  }
                  if (wanted.has(id)) shown.add(id)
                  else shown.delete(id)
                }
              })),
            reporting(`The chart ${node.id}`),
            Effect.forkScoped
          )
          return made
        }),
      toolbar: (node) =>
        Effect.gen(function* () {
          const model = yield* remoteClicks(page, node.id)
          return yield* toolbar(Effect.forEach(node.items, (item) =>
            Effect.gen(function* () {
              if ("title" in item) return void (yield* toolbarTitle(item.title))
              if ("spacer" in item) return void (yield* toolbarSpacer)
              if ("separator" in item) return void (yield* toolbarSeparator)
              const clicks = yield* toolbarButton({
                ...(item.label === undefined ? {} : { label: item.label }),
                ...(item.icon === undefined ? {} : { icon: item.icon }),
                ...(item.tooltip === undefined ? {} : { tooltip: item.tooltip }),
                ...(item.color === undefined ? {} : { color: item.color }),
                ...(item.view === undefined ? {} : { view: item.view })
              })
              yield* clicks.pipe(Stream.runForEach(() => model.click(item.id)), reporting(`The toolbar ${node.id}`), Effect.forkScoped)
            }), { discard: true }))
        }),
      button: (node) =>
        Effect.gen(function* () {
          const model = yield* remoteClicks(page, node.id)
          const made = yield* button({
            label: node.label,
            ...(node.color === undefined ? {} : { color: node.color }),
            ...(node.view === undefined ? {} : { view: node.view }),
            ...(node.disabled === true ? { disabled: yield* SubscriptionRef.make(true) } : {})
          })
          yield* made.clicks.pipe(Stream.runForEach(() => model.click(node.id)), reporting(`The button ${node.id}`), Effect.forkScoped)
          return made
        }),
      menu: (node) =>
        Effect.gen(function* () {
          const model = yield* remoteClicks(page, node.id)
          const made = yield* menu({ items: node.items as never })
          yield* made.choices.pipe(Stream.runForEach((id) => model.click(id)), reporting(`The menu ${node.id}`), Effect.forkScoped)
          return made
        }),
      ribbon: (node) =>
        Effect.gen(function* () {
          const model = yield* remoteClicks(page, node.id)
          const made = yield* ribbon({ blocks: node.blocks as never })
          yield* made.choices.pipe(Stream.runForEach((id) => model.click(id)), reporting(`The ribbon ${node.id}`), Effect.forkScoped)
          return made
        }),
      list: (node) =>
        Effect.gen(function* () {
          const model = yield* remoteSelection(page, node.id)
          return yield* renderList(model, { data: yield* dataCollection(model.rows), template: fieldsTemplate(node.fields), ...(node.itemHeight === undefined ? {} : { itemHeight: node.itemHeight }) })
        }),
      dataview: (node) =>
        Effect.gen(function* () {
          const model = yield* remoteSelection(page, node.id)
          return yield* renderDataView(model, { data: yield* dataCollection(model.rows), template: fieldsTemplate(node.fields), ...(node.itemsInRow === undefined ? {} : { itemsInRow: node.itemsInRow }) })
        }),
      tree: (node) =>
        Effect.gen(function* () {
          const model = yield* remoteTree(page, node.id)
          return yield* renderTree(model, { data: yield* treeCollection(model.rows) })
        }),
      gantt: (node) => Effect.flatMap(remoteGantt(page, node.id), renderGantt),
      scheduler: (node) =>
        Effect.gen(function* () {
          const browser = yield* Browser
          const today = zoned(yield* SubscriptionRef.get(browser.now), yield* SubscriptionRef.get(browser.timeZone)).day
          return yield* renderScheduler(yield* remoteScheduler(page, node.id, today))
        }),
      kanban: (node) =>
        Effect.gen(function* () {
          const text = (row: Row, field: string | undefined) => (field === undefined ? undefined : String((row as unknown as Record<string, unknown>)[field] ?? ""))
          return yield* renderKanban(yield* remoteKanban<Row>(page, node.id), {
            field: node.field as never,
            columns: node.columns as never,
            ...(node.lanes === undefined ? {} : { lanes: node.lanes as never }),
            label: (row) => text(row, node.labelField) ?? "",
            description: (row) => text(row, node.descriptionField)
          })
        })
    }) as Effect.Effect<unknown, never, Host | Browser | Scope.Scope>
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
 * A value of a model in the plugin, both ways, for a widget that sets its own ref (the chosen child
 * of tabs or a sidebar, the day of a DatePicker): a change sets `active`, which goes to the plugin as
 * `set`; the value of the plugin comes back into `active`, also after a refusal.
 */
const chosen = <A>(page: PluginHost, id: string, first: A) =>
  Effect.flatMap(remoteValue<A>(page, id, first, STATES.tabbar), (model) => bridge(model.value, model.set))

/**
 * A local ref for a widget that sets its own ref, joined to a ref of a remote model: a change of the
 * widget is the action `act`, and the value of the plugin comes back into the local ref.
 */
const bridge = <A>(remote: SubscriptionRef.SubscriptionRef<A>, act: (value: A) => Effect.Effect<boolean>) =>
  Effect.gen(function* () {
    const local = yield* SubscriptionRef.make(yield* SubscriptionRef.get(remote))
    yield* SubscriptionRef.changes(remote).pipe(
      Stream.runForEach((value) => Effect.flatMap(SubscriptionRef.get(local), (now) => (stableJson(now) === stableJson(value) ? Effect.void : SubscriptionRef.set(local, value)))),
      Effect.forkScoped
    )
    yield* SubscriptionRef.changes(local).pipe(
      Stream.runForEach((value) => Effect.flatMap(SubscriptionRef.get(remote), (now) => (stableJson(now) === stableJson(value) ? Effect.void : act(value)))),
      Effect.forkScoped
    )
    return local
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

/**
 * A DHTMLX Window for a window node, open while the model in the plugin says so. The cross of the
 * user is the action `close`; a close from the plugin closes the window.
 */
const windowOf = (page: PluginHost, node: Extract<UiNode, { readonly _tag: "window" }>, children: SubscriptionRef.SubscriptionRef<ReadonlyArray<UiNode>>) =>
  Effect.gen(function* () {
    const refs = yield* childRefs(node, children)
    const model = yield* remoteWindow(page, node.id)
    const options = { title: node.title, ...(node.width === undefined ? {} : { width: node.width }), ...(node.height === undefined ? {} : { height: node.height }), ...(node.modal === undefined ? {} : { modal: node.modal }) }
    let shown: Fiber.Fiber<void> | undefined
    yield* SubscriptionRef.changes(model.open).pipe(
      Stream.runForEach((open) =>
        Effect.gen(function* () {
          if (open && shown === undefined) {
            shown = yield* openWindow(options, () => fill(nodePart(page, refs.get(node.child.id)!, "column"))).pipe(
              // The window closed: by its cross, unless the plugin closed it.
              Effect.andThen(Effect.suspend(() => {
                shown = undefined
                return Effect.flatMap(SubscriptionRef.get(model.open), (still) => (still ? Effect.asVoid(model.close) : Effect.void))
              })),
              Effect.forkScoped
            )
          } else if (!open && shown !== undefined) {
            const fiber = shown
            shown = undefined
            yield* Fiber.interrupt(fiber)
          }
        })),
      reporting(`The window ${node.id} of the plugin`),
      Effect.forkScoped
    )
  })

/** A Layout for a layout node: a cell for each child, and the hidden cells of the model in the plugin. */
const layoutOf = (page: PluginHost, node: Extract<UiNode, { readonly _tag: "layout" }>, children: SubscriptionRef.SubscriptionRef<ReadonlyArray<UiNode>>) =>
  Effect.gen(function* () {
    const refs = yield* childRefs(node, children)
    const model = yield* remoteModel(page, node.id, { hidden: [] as ReadonlyArray<string> }, CELLS_ACTIONS, STATES.layout)
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
          yield* SubscriptionRef.set(children, childrenOf(node))
          const next = shapeOf(node)
          if (next === shape) return
          shape = next
          // The base of each new widget: a widget can change these (a sidebar sets a row), so they
          // are set again only when the widget is made again, not on each change of the node.
          element.style.position = "relative"
          element.style.display = "flex"
          element.style.flexDirection = "column"
          const tooltip = "tooltip" in node ? node.tooltip : undefined
          yield* show(widgetOf(page, node, children).pipe(
            Effect.tap(() => (typeof tooltip === "string" ? tooltipOn(element, tooltip) : Effect.void)),
            Effect.provideService(Host, element)
          ))
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
    yield* page.asks.pipe(
      Stream.runForEach((ask) => Effect.forkScoped(answer(page, ask).pipe(Effect.provide(layerDialogsLive), reporting("A question of the plugin")))),
      Effect.forkScoped
    )
  })

/** Text of the plugin, shown as text: a dialog of DHTMLX takes HTML. */
const plain = (value: unknown) => String(value ?? "").replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`)

/** Shows a question of the plugin with the dialogs of the page, and sends the answer back. */
const answer = (page: PluginHost, ask: AskMessage) =>
  Effect.gen(function* () {
    const dialogs = yield* Dialogs
    const options = ask.options
    const header = options["header"] === undefined ? {} : { header: plain(options["header"]) }
    const buttons = options["buttons"]
    if (ask.kind === "confirm") {
      const yes = yield* dialogs.confirm({
        text: plain(options["text"]),
        ...header,
        ...(Array.isArray(buttons) && buttons.length === 2 ? { buttons: [plain(buttons[0]), plain(buttons[1])] as const } : {})
      })
      return yield* page.reply(ask.n, yes)
    }
    if (ask.kind === "alert") {
      yield* dialogs.alert({ text: plain(options["text"]), ...header, ...(options["button"] === undefined ? {} : { button: plain(options["button"]) }) })
      return yield* page.reply(ask.n, true)
    }
    const kind = options["kind"]
    yield* dialogs.message({
      text: plain(options["text"]),
      ...(typeof options["expire"] === "number" ? { expire: options["expire"] } : {}),
      ...(kind === "success" || kind === "danger" || kind === "info" ? { kind } : {})
    })
  })
