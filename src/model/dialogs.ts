import { Context, Effect, Layer } from "effect"
import { UiState } from "./ui-state"

/**
 * Messages and questions to the user as Effects. A widget asks the `Dialogs` service and does not
 * call DHTMLX: the page gives the live layer, a plugin gives `layerDialogsPlugin`, a test gives
 * answers. `confirm` gives the answer of the user; an interrupt closes the question, as a click on
 * the second button does. The text is plain text.
 */
export type ConfirmOptions = {
  readonly text: string
  readonly header?: string
  /** The yes and the no button. */
  readonly buttons?: readonly [string, string]
}
export type AlertOptions = { readonly text: string; readonly header?: string; readonly button?: string }
export type MessageOptions = { readonly text: string; readonly expire?: number; readonly kind?: "info" | "success" | "danger" }

export class Dialogs extends Context.Service<Dialogs, {
  readonly confirm: (options: ConfirmOptions) => Effect.Effect<boolean>
  readonly alert: (options: AlertOptions) => Effect.Effect<void>
  /** A short note in a corner of the page, that goes after `expire` ms. */
  readonly message: (options: MessageOptions) => Effect.Effect<void>
}>()("dhtmlx-effect/Dialogs") {}

/** The dialogs of a plugin: each one is asked of the page over the channel of `UiState`. */
export const layerDialogsPlugin = Layer.effect(Dialogs)(
  Effect.gen(function* () {
    const ui = yield* UiState
    return {
      confirm: (options) => ui.ask("confirm", options),
      alert: (options) => Effect.asVoid(ui.ask("alert", options)),
      message: (options) => Effect.asVoid(ui.ask("message", options))
    } satisfies Dialogs["Service"]
  })
)
