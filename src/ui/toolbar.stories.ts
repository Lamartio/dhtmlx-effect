import type { Meta, StoryObj } from "@storybook/html-vite"
import { Effect, Stream } from "effect"
import { swap } from "./host"
import { element, inside, widgetStory } from "../storybook/story"
import { toolbar, toolbarButton, toolbarSeparator, toolbarSpacer, toolbarTitle } from "./toolbar"

/** The DHTMLX Toolbar. Its items need a ToolbarSlot, as a widget needs a Host. */
const meta: Meta = { title: "Suite/Toolbar" }
export default meta
type Story = StoryObj

const log = (node: HTMLElement, line: string) =>
  Effect.sync(() => {
    node.textContent = `${line}\n${node.textContent ?? ""}`.split("\n").slice(0, 12).join("\n")
  })

export const Items: Story = {
  render: () =>
    widgetStory(Effect.gen(function* () {
      const barHost = yield* element("div")
      const out = yield* element("pre", "dhxe-log", "Click a button.")
      const buttons = yield* inside(barHost, toolbar(Effect.gen(function* () {
        yield* toolbarTitle("Notes")
        yield* toolbarSeparator
        const fresh = yield* toolbarButton({ label: "New" })
        const open = yield* toolbarButton({ label: "Open" })
        yield* toolbarSpacer
        const share = yield* toolbarButton({ label: "Share" })
        return { fresh, open, share }
      })))
      for (const [name, clicks] of Object.entries(buttons)) {
        yield* clicks.pipe(Stream.runForEach(() => log(out, `${name} clicked`)), Effect.forkScoped)
      }
    }))
}

/**
 * Two modes, as tabs would be: each mode is a scope with its items. The swap closes the scope of the
 * mode before it, so its items leave the toolbar and their click streams end.
 */
export const Modes: Story = {
  render: () =>
    widgetStory(Effect.gen(function* () {
      const barHost = yield* element("div")
      const out = yield* element("pre", "dhxe-log", "")
      yield* element("p", "dhxe-note", "Read and Edit swap a set of items. Each set lives in a scope: when it closes, toolbar.data.remove runs for each item.")
      yield* inside(barHost, toolbar(Effect.gen(function* () {
        const show = yield* swap
        yield* toolbarTitle("Mode")
        const read = yield* toolbarButton({ label: "Read" })
        const edit = yield* toolbarButton({ label: "Edit" })
        yield* toolbarSeparator
        const readMode = Effect.gen(function* () {
          const print = yield* toolbarButton({ label: "Print" })
          yield* log(out, "read mode: 1 item in")
          yield* Effect.addFinalizer(() => log(out, "read mode: items out"))
          yield* print.pipe(Stream.runForEach(() => log(out, "print")), Effect.forkScoped)
        })
        const editMode = Effect.gen(function* () {
          const bold = yield* toolbarButton({ label: "Bold" })
          const italic = yield* toolbarButton({ label: "Italic" })
          yield* toolbarButton({ label: "Link" })
          yield* log(out, "edit mode: 3 items in")
          yield* Effect.addFinalizer(() => log(out, "edit mode: items out"))
          yield* bold.pipe(Stream.runForEach(() => log(out, "bold")), Effect.forkScoped)
          yield* italic.pipe(Stream.runForEach(() => log(out, "italic")), Effect.forkScoped)
        })
        yield* show(readMode)
        yield* read.pipe(Stream.runForEach(() => show(readMode)), Effect.forkScoped)
        yield* edit.pipe(Stream.runForEach(() => show(editMode)), Effect.forkScoped)
      })))
    }))
}
