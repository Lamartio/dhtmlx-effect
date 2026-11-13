import { html, locales, markdown, Richtext, text } from "@dhtmlx/richtext"
import { Effect, Scope, SubscriptionRef } from "effect"
import { Browser, follow } from "./browser"
import { Host, resource } from "./host"
import { reportedCallback } from "./problems"
import { wxClear, wxLanguage, wxTheme } from "./wx"

/** How the value is written: HTML, Markdown, or plain text. */
export type RichtextFormat = "html" | "markdown" | "text"

const encoders = (format: RichtextFormat) =>
  format === "markdown" ? { from: markdown.fromMarkdown, to: markdown.toMarkdown } : format === "text" ? { from: text.fromText, to: text.toText } : { from: html.fromHTML, to: html.toHTML }

export type RichtextOptions = {
  /** The text, both ways, in `format`. */
  readonly value: SubscriptionRef.SubscriptionRef<string>
  /** Default: `html`. */
  readonly format?: RichtextFormat
  /** Default: true. */
  readonly toolbar?: boolean
  /** Default: false. */
  readonly menubar?: boolean
}

/**
 * A DHTMLX RichText editor in the host. The text is in `value`, as HTML, Markdown or plain text:
 * what the user writes goes in, and a new value from the code shows in the editor. The editor can
 * write a text in another form than it got (other spaces, other tags): the value changes only after
 * the user changed the text. The theme and the language follow `Browser`.
 */
export const richtext = (options: RichtextOptions) =>
  Effect.gen(function* () {
    const host = yield* Host
    const browser = yield* Browser
    const encoder = encoders(options.format ?? "html")
    const dark = yield* SubscriptionRef.get(browser.dark)
    const language = wxLanguage(yield* SubscriptionRef.get(browser.locale))
    const first = yield* SubscriptionRef.get(options.value)
    // The text as the editor writes it back: it can differ from the text it got (other spaces, other tags).
    const written = (value: string): string => encoder.to(encoder.from(value))
    const view = yield* resource(
      "richtext",
      // The first text goes in with the config, as HTML: the editor starts in a later task, and a
      // `setValue` before that is lost.
      () => new Richtext(host, { value: html.toHTML(encoder.from(first)), toolbar: options.toolbar ?? true, menubar: options.menubar ?? false, theme: wxTheme(dark), locale: locales[language] }),
      (view) => {
        view.destructor()
        wxClear(host)
      }
    )
    const read = () => view.getValue(encoder.to)
    // The text that the editor has, as it writes it. A text that came from `value` is not sent back,
    // also when the editor tells about it in a later task.
    let known: string = written(first)
    let applying = false
    const put = (value: string) => {
      known = written(value)
      applying = true
      try {
        view.setValue(value, encoder.from)
      } finally {
        applying = false
      }
    }
    let given: string = first
    yield* follow(options.value, (value) => {
      if (value === known || value === given) return
      given = value
      put(value)
    }, "The RichText, while it followed its value")

    const onChange = yield* reportedCallback("The RichText, on a change of the text", () => {
      if (applying) return
      const next = read()
      if (next === known) return
      known = next
      given = next
      Effect.runSync(SubscriptionRef.set(options.value, next))
    })
    // The editor tells about each change of the text, and its document is a store that calls back.
    view.api.on("change" as never, onChange as never)
    view.api.getReactiveState().document.subscribe(onChange as never)

    // A new theme or language makes the editor again inside: the text of now goes back in.
    const again = (config: Parameters<Richtext["setConfig"]>[0]) => {
      const now = read()
      known = written(now)
      applying = true
      try {
        // The text of now goes with the config, as the editor starts again from its config.
        view.setConfig({ ...config, value: html.toHTML(encoder.from(now)) })
      } finally {
        applying = false
      }
    }
    let shownDark = dark
    yield* follow(browser.dark, (next) => {
      if (next === shownDark) return
      shownDark = next
      again({ theme: wxTheme(next) })
    })
    let shownLanguage = language
    yield* follow(browser.locale, (tag) => {
      const next = wxLanguage(tag)
      if (next === shownLanguage) return
      shownLanguage = next
      again({ locale: locales[next] })
    })
    return { richtext: view, value: options.value }
  }) as Effect.Effect<{ readonly richtext: Richtext; readonly value: SubscriptionRef.SubscriptionRef<string> }, never, Host | Browser | Scope.Scope>
