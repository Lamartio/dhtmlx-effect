import type { Meta, StoryObj } from "@storybook/html-vite"
import { Effect, Schema, Stream, SubscriptionRef } from "effect"
import { element, widgetStory } from "../storybook/story"
import { type AvatarValue, form, type FormFile } from "./form"
import { Host } from "./host"

/**
 * The controls of the Form that shape it or hold files: a fieldset around fields, a spacer, a
 * picture and a list of files.
 */
const meta: Meta = { title: "Suite/Form layout and files" }
export default meta
type Story = StoryObj

const Member = Schema.Struct({
  first: Schema.String.check(Schema.isMinLength(2, { message: "Give at least 2 letters" })),
  last: Schema.String,
  city: Schema.String,
  country: Schema.Literals(["Netherlands", "Belgium", "Germany"]),
  photo: Schema.optional(Schema.Unknown),
  papers: Schema.Array(Schema.Unknown)
})

/** What the log shows of a value: a file is its name, not its bytes. */
const show = (values: Readonly<Record<string, unknown>>) => {
  const photo = values["photo"] as AvatarValue | undefined
  const papers = (values["papers"] ?? []) as ReadonlyArray<FormFile>
  return JSON.stringify({ ...values, photo: photo === undefined ? undefined : photo.file?.name ?? "a picture", papers: papers.map((file) => `${file.name} (${file.size} bytes)`) }, null, 2)
}

export const Layout: Story = {
  name: "Fieldsets, a picture and files",
  render: () =>
    widgetStory(Effect.gen(function* () {
      const host = yield* Host
      host.classList.add("dhxe-pane")
      const values = yield* SubscriptionRef.make<Readonly<Record<string, unknown>>>({ first: "Anna", last: "Vos", city: "Utrecht", country: "Netherlands", papers: [] })
      yield* form({
        schema: Member,
        values,
        submitLabel: "Save",
        fields: [
          { name: "who", kind: "fieldset", label: "Who", direction: "cols", fields: [{ name: "photo", kind: "avatar", label: "Picture" }, { name: "first" }, { name: "last", label: "Family name" }] },
          { name: "where", kind: "fieldset", label: "Where", direction: "cols", fields: [{ name: "city" }, { name: "country", kind: "radio", options: ["Netherlands", "Belgium", "Germany"].map((value) => ({ value, label: value })) }] },
          { name: "gap", kind: "spacer", height: 12 },
          { name: "papers", kind: "files", label: "Papers" }
        ]
      })
      yield* element("p", "dhxe-note", "The fieldsets only place the fields: the values are one flat record. The form sends no file: the app takes them from the values.")
      const out = yield* element("pre", "dhxe-log")
      yield* SubscriptionRef.changes(values).pipe(Stream.runForEach((now) => Effect.sync(() => (out.textContent = show(now)))), Effect.forkScoped)
    }))
}
