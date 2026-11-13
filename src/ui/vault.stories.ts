import type { Meta, StoryObj } from "@storybook/html-vite"
import { Effect, Stream, SubscriptionRef } from "effect"
import "@dhtmlx/vault/codebase/vault.min.css"
import { element, widgetStory } from "../storybook/story"
import { column, Host } from "./host"
import { vault } from "./vault"

/**
 * The Vault. This story has no server, so it sends nothing: add files with the button or a drop, and
 * the list of files shows below as the code sees it.
 */
const meta: Meta = { title: "Vault" }
export default meta
type Story = StoryObj

const files = (mode: "list" | "grid") =>
  widgetStory(Effect.gen(function* () {
    const [log, made] = yield* column([
      element("pre", "dhxe-log", "No files yet."),
      Effect.gen(function* () {
        const host = yield* Host
        host.style.minHeight = "360px"
        return yield* vault({ mode })
      })
    ])
    yield* SubscriptionRef.changes(made.files).pipe(
      Stream.runForEach((all) =>
        Effect.sync(() => (log.textContent = all.length === 0 ? "No files yet." : all.map((file) => `${file.name}  ${file.size} bytes  ${file.status}`).join("\n")))),
      Effect.forkScoped
    )
  }))

export const List: Story = { render: () => files("list") }

export const Grid: Story = { render: () => files("grid") }
