import { setTheme } from "dhx-suite"
import { Effect, PubSub, Stream, SubscriptionRef } from "effect"
import { Browser, follow } from "./browser"
import { Host, resource } from "./host"

export type ButtonOptions = {
  readonly label: string | SubscriptionRef.SubscriptionRef<string>
  readonly color?: "primary" | "secondary" | "danger" | "success"
  readonly view?: "flat" | "link"
  readonly disabled?: SubscriptionRef.SubscriptionRef<boolean>
}

/**
 * A DHTMLX button that stands alone: the CSS of DHTMLX Suite on a plain `<button>`, as the Suite has
 * no Button widget of its own. Gives the clicks as a stream. The theme follows `Browser.dark`.
 */
export const button = (options: ButtonOptions) =>
  Effect.gen(function* () {
    const host = yield* Host
    const browser = yield* Browser
    const clicks = yield* Effect.acquireRelease(PubSub.unbounded<MouseEvent>(), PubSub.shutdown)
    const element = yield* resource(
      "button",
      () => {
        const element = document.createElement("button")
        element.type = "button"
        element.className = `dhx_button dhx_button--size_medium dhx_button--view_${options.view ?? "flat"} dhx_button--color_${options.color ?? "primary"}`
        host.append(element)
        return element
      },
      (element) => element.remove()
    )
    yield* resource(
      "listener",
      () => {
        const listener = (event: MouseEvent) => Effect.runSync(PubSub.publish(clicks, event))
        element.addEventListener("click", listener)
        return listener
      },
      (listener) => element.removeEventListener("click", listener)
    )
    if (typeof options.label === "string") element.textContent = options.label
    else yield* follow(options.label, (label) => (element.textContent = label))
    if (options.disabled !== undefined) {
      yield* follow(options.disabled, (disabled) => {
        element.disabled = disabled
        element.classList.toggle("dhx_button--disabled", disabled)
      })
    }
    yield* follow(browser.dark, (dark) => setTheme(dark ? "dark" : "light", host))
    return { element, clicks: Stream.fromPubSub(clicks) }
  })
