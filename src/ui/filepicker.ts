import { Effect, PubSub, type Scope, Stream } from "effect"
import { Host, resource } from "./host"
import { reportedCallback } from "./problems"

export type FilePickerOptions = {
  readonly label?: string
  /** The kinds of file, as for `<input type="file">`, such as `image/*,.pdf`. */
  readonly accept?: string
  readonly multiple?: boolean
}

/**
 * A button that opens the file dialog of the browser: a plain `<input type="file">` in a label with
 * the CSS of a DHTMLX button. Gives each file that the user picks.
 */
export const filePicker = (options: FilePickerOptions = {}) =>
  Effect.gen(function* () {
    const host = yield* Host
    const picked = yield* Effect.acquireRelease(PubSub.unbounded<File>(), PubSub.shutdown)
    const onChange = yield* reportedCallback("The file picker, on a pick", (event: Event) => {
      const field = event.target as HTMLInputElement
      for (const file of field.files ?? []) Effect.runSync(PubSub.publish(picked, file))
      // The same file can be picked again.
      field.value = ""
    })
    yield* resource(
      "filepicker",
      () => {
        const label = document.createElement("label")
        label.className = "dhx_button dhx_button--size_medium dhx_button--view_flat dhx_button--color_primary"
        label.textContent = options.label ?? "Pick a file"
        const field = document.createElement("input")
        field.type = "file"
        field.hidden = true
        if (options.accept !== undefined) field.accept = options.accept
        field.multiple = options.multiple === true
        field.addEventListener("change", onChange)
        label.append(field)
        host.append(label)
        return label
      },
      (label) => label.remove()
    )
    return { picked: Stream.fromPubSub(picked) }
  }) as Effect.Effect<{ readonly picked: Stream.Stream<File> }, never, Host | Scope.Scope>
