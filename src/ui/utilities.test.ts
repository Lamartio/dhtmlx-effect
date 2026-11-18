import { it } from "@effect/vitest"
import { awaitRedraw } from "dhx-suite"
import { Effect } from "effect"
import { expect } from "vitest"
import "dhx-suite/codebase/suite.min.css"
import "../styles.css"
import { connectHost, type HostMessage, memoryChannel, type PluginMessage, servePlugin } from "../model/remote"
import { UiState, uiState } from "../model/ui-state"
import { bindTree, Button, Column, Combobox, Form, Grid, Slider, Toolbar } from "../model/nodes"
import { Browser, browserWith } from "./browser"
import { Host } from "./host"
import { renderPlugin } from "./plugin-host"

const FACTS = { dark: false, locale: "en-GB", timeZone: "Europe/Amsterdam", viewport: { width: 1200, height: 800 }, now: new Date("2026-11-17T10:00:00Z") }
const TEXT = ["text-2xl", "italic", "font-bold", "normal-case"] as const

it.live("gives the text classes of a node to the DHTMLX widgets in it, which set their own font", () =>
  Effect.gen(function* () {
    const element = document.createElement("div")
    element.style.height = "700px"
    document.body.append(element)
    const browser = yield* browserWith(FACTS)
    yield* Effect.scoped(Effect.gen(function* () {
      const [pluginEnd, hostEnd] = yield* memoryChannel<HostMessage, PluginMessage>()
      const ui = yield* uiState
      yield* bindTree(Column.make({
        id: "main",
        children: [
          Button.make({ id: "b", label: "Btn", size: 50, classes: [...TEXT] }),
          Slider.make({ id: "s", label: "SliderLabel", size: 80, classes: [...TEXT] }),
          Combobox.make({ id: "c", label: "ComboLabel", value: "a", options: [{ value: "a", label: "A" }], size: 80, classes: [...TEXT] }),
          Toolbar.make({ id: "t", size: 50, items: [{ title: "TbTitle" }], classes: [...TEXT] }),
          Form.make({ id: "f", fields: [{ name: "x", label: "FormLabel", kind: "text" }], size: 120, classes: [...TEXT] }),
          Grid.make({ id: "g", columns: [{ id: "title", header: "GridHead" }], rows: [{ id: "1", title: "GridCell" }], size: 120, classes: [...TEXT] })
        ]
      })).pipe(Effect.provideService(UiState, ui))
      const page = yield* connectHost(hostEnd)
      yield* servePlugin(ui, pluginEnd)
      yield* renderPlugin(page).pipe(Effect.provideService(Host, element), Effect.provideService(Browser, browser))
      for (let i = 0; i < 3; i++) {
        yield* Effect.promise(() => new Promise((done) => setTimeout(done, 50)))
        yield* Effect.promise(() => awaitRedraw())
      }
      const fonts: Record<string, string> = {}
      const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT)
      for (let text = walker.nextNode(); text !== null; text = walker.nextNode()) {
        const name = text.textContent!.trim()
        if (!/^(Btn|SliderLabel|ComboLabel|TbTitle|FormLabel|GridHead|GridCell)$/.test(name)) continue
        const style = getComputedStyle(text.parentElement!)
        fonts[name] = `${style.fontSize} ${style.fontStyle} ${style.fontWeight} ${style.textTransform}`
      }
      const input = getComputedStyle(element.querySelector("input")!)
      fonts["input"] = `${input.fontSize} ${input.fontStyle}`
      const all = "24px italic 700 none"
      expect(fonts).toEqual({ Btn: all, SliderLabel: all, ComboLabel: all, TbTitle: all, FormLabel: all, GridHead: all, GridCell: all, input: "24px italic" })
    }))
  }))
