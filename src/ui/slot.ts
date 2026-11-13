import { Effect } from "effect"
import { connected, resource } from "./host"

let slots = 0

/**
 * An element of ours inside a DHTMLX container that draws its own DOM: a layout cell, a window or a
 * popup. DHTMLX takes a widget of its own or HTML in a cell, not an element. So the cell gets a small place in HTML, and our element goes into it. When
 * DHTMLX draws the cell again and the place is new, the element moves into the new place: its
 * children, such as a Gantt, stay the same objects.
 *
 * Gives the element when it is in the page, as a widget measures its host when it starts.
 */
export const slot = (attachHTML: (html: string) => void, className = "dhxe-slot") =>
  Effect.gen(function* () {
    const id = `dhxe-slot-${++slots}`
    const element = yield* resource(
      "element",
      () => {
        const element = document.createElement("div")
        element.className = className
        return element
      },
      (element) => element.remove()
    )
    const place = () => {
      if (element.parentElement?.dataset["slot"] === id && element.isConnected) return
      const target = document.querySelector<HTMLElement>(`[data-slot="${id}"]`)
      if (target !== null) target.append(element)
    }
    attachHTML(`<div class="dhxe-slot-place" data-slot="${id}"></div>`)
    yield* resource(
      "observer",
      () => {
        const observer = new MutationObserver(place)
        observer.observe(document.body, { childList: true, subtree: true })
        return observer
      },
      (observer) => observer.disconnect()
    )
    place()
    yield* connected(element)
    return element
  })
