import { Effect } from "effect"
import { Host, resource, type Widget } from "../ui/host"

/** The tree behind each element that a story gives. */
const trees = new WeakMap<object, Widget>()

/**
 * What a story gives: an empty element with an Effect tree behind it, as the html renderer of
 * Storybook takes only elements. The decorator (`browserDecorator`) runs the tree with the Browser
 * layer of Storybook, so a change in the toolbar of Storybook goes into the running tree.
 */
export const widgetStory = (widget: Widget): HTMLElement => {
  const placeholder = document.createElement("div")
  trees.set(placeholder, widget)
  return placeholder
}

/** The tree of a story, when it has one. */
export const treeOf = (value: unknown): Widget | undefined => (typeof value === "object" && value !== null ? trees.get(value) : undefined)

/** An element of the story page, for the life of the scope: a line of text, a table, a log. */
export const element = <K extends keyof HTMLElementTagNameMap>(tag: K, className = "", text = "") =>
  Effect.gen(function* () {
    const host = yield* Host
    return yield* resource(
      "element",
      () => {
        const node = document.createElement(tag)
        node.className = className
        node.textContent = text
        host.append(node)
        return node
      },
      (node) => node.remove()
    )
  })

/** A part in an element of its own, under the parts before it. */
export const inside = <A, R>(node: HTMLElement, part: Effect.Effect<A, never, R>) => Effect.provideService(part, Host, node)
