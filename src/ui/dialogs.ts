import { alert as dhxAlert, confirm as dhxConfirm, message as dhxMessage, setTheme, tooltip as dhxTooltip } from "dhx-suite"
import { Effect, Layer, Queue, SubscriptionRef } from "effect"
import { Dialogs } from "../model/dialogs"
import { Browser } from "./browser"

export { type AlertOptions, type ConfirmOptions, Dialogs, type MessageOptions } from "../model/dialogs"

/** The newest dialog of DHTMLX in the page: its buttons answer it, its blocker shuts it. */
const newestDialog = () => {
  const all = document.querySelectorAll<HTMLElement>(".dhx_alert")
  return all[all.length - 1]
}

/** A DHTMLX dialog as an Effect: it waits for the promise, and an interrupt presses the last button. */
const dialog = <A>(open: () => Promise<A>) =>
  Effect.callback<A>((resume) => {
    let settled = false
    open().then((answer) => {
      settled = true
      resume(Effect.succeed(answer))
    })
    const element = newestDialog()
    return Effect.sync(() => {
      if (settled || element === undefined) return
      const buttons = element.querySelectorAll<HTMLButtonElement>("button")
      buttons[buttons.length - 1]?.click()
    })
  })

/**
 * The real dialogs of DHTMLX. They live in `<body>`, out of any widget, so each one takes the dark
 * mode of `Browser` when it opens.
 */
export const layerDialogsLive = Layer.effect(Dialogs)(
  Effect.gen(function* () {
    const browser = yield* Browser
    const themed = <A>(open: () => Promise<A>) =>
      SubscriptionRef.get(browser.dark).pipe(
        Effect.flatMap((dark) =>
          dialog(() => {
            const answer = open()
            const element = newestDialog()
            if (element !== undefined) setTheme(dark ? "dark" : "light", element)
            return answer
          })
        )
      )
    return {
      confirm: (options) =>
        themed(() =>
          dhxConfirm({
            text: options.text,
            ...(options.header === undefined ? {} : { header: options.header }),
            buttons: [options.buttons?.[1] ?? "Cancel", options.buttons?.[0] ?? "OK"],
            buttonsAlignment: "right"
          }) as Promise<boolean>
        ),
      alert: (options) =>
        themed(() => dhxAlert({ text: options.text, ...(options.header === undefined ? {} : { header: options.header }), buttons: [options.button ?? "OK"], buttonsAlignment: "right" })).pipe(Effect.asVoid),
      message: (options) =>
        Effect.sync(() => {
          dhxMessage({ text: options.text, expire: options.expire ?? 4000, css: `dhxe-message dhxe-message--${options.kind ?? "info"}` })
        })
    } satisfies Dialogs["Service"]
  })
)

/**
 * Dialogs for a test: `confirm` takes the next answer from the queue, so a test answers as the user
 * would; `alert` and `message` go into `said`.
 */
export const layerDialogsAnswering = (answers: Queue.Queue<boolean>, said: Array<string> = []) =>
  Layer.succeed(Dialogs)({
    confirm: (options) => Effect.sync(() => said.push(`confirm: ${options.text}`)).pipe(Effect.andThen(Queue.take(answers))),
    alert: (options) => Effect.sync(() => void said.push(`alert: ${options.text}`)),
    message: (options) => Effect.sync(() => void said.push(`message: ${options.text}`))
  })

/**
 * A tooltip on an element, for the life of the scope: DHTMLX shows it on hover and focus. The text
 * is plain text.
 */
export const tooltipOn = (element: HTMLElement, text: string, position: "top" | "bottom" | "left" | "right" = "bottom") =>
  Effect.acquireRelease(
    Effect.sync(() => {
      const show = () => dhxTooltip(text, { node: element, position: position as never })
      element.addEventListener("mouseenter", show)
      element.addEventListener("focus", show)
      return show
    }),
    (show) => Effect.sync(() => {
      element.removeEventListener("mouseenter", show)
      element.removeEventListener("focus", show)
    })
  ).pipe(Effect.asVoid)
