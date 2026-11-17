import { Cause, Effect, Queue, Schema, type Scope, Stream } from "effect"
import { Problems } from "../ui/problems"
import type { Channel, HostMessage, PluginMessage } from "./remote"

/**
 * The messages of a plugin and its page over `postMessage`. The page gives the plugin one
 * `MessagePort`, once, to the origin of the plugin; after that all messages go over the port. Each
 * side checks each message with a Schema, and drops one that does not pass.
 */

const PatchOpSchema = Schema.Union([
  Schema.Struct({ op: Schema.Literals(["add", "replace"]), path: Schema.String, value: Schema.Unknown }),
  Schema.Struct({ op: Schema.Literal("remove"), path: Schema.String })
])

/** What the plugin sends: the state, and the answers to actions. */
export const PluginMessageSchema = Schema.Union([
  Schema.TaggedStruct("full", { seq: Schema.Number, state: Schema.Unknown, hash: Schema.String }),
  Schema.TaggedStruct("patch", { seq: Schema.Number, patch: Schema.Array(PatchOpSchema), hash: Schema.String }),
  Schema.TaggedStruct("answer", { n: Schema.Number, accepted: Schema.Boolean })
])

/** What the page sends: the actions of the user, and a request for the whole state. */
export const HostMessageSchema = Schema.Union([
  Schema.TaggedStruct("action", { n: Schema.Number, id: Schema.String, action: Schema.String, args: Schema.Array(Schema.Unknown) }),
  Schema.TaggedStruct("resync", {})
])

/**
 * A channel on a `MessagePort`, for the life of the scope. A message that does not pass `schema` is
 * reported to `Problems` and dropped.
 */
export const portChannel = <In, Out>(port: MessagePort, schema: Schema.Schema<In>, where: string): Effect.Effect<Channel<In, Out>, never, Scope.Scope> =>
  Effect.gen(function* () {
    const problems = yield* Problems
    const inbox = yield* Queue.unbounded<In>()
    const valid = Schema.is(schema as never) as (value: unknown) => value is In
    yield* Effect.acquireRelease(
      Effect.sync(() => {
        port.onmessage = (event: MessageEvent) => {
          if (valid(event.data)) Effect.runSync(Queue.offer(inbox, event.data))
          else Effect.runFork(problems.report(where, Cause.fail(new Error(`A message that is not a message of the plugin: ${JSON.stringify(event.data)?.slice(0, 200)}`))))
        }
        port.start()
      }),
      () => Effect.sync(() => {
        port.onmessage = null
        port.close()
      })
    )
    return { messages: Stream.fromQueue(inbox), send: (message: Out) => Effect.sync(() => port.postMessage(message, transferables(message))) }
  })

/** The bytes of the files in the args of an action: they move to the other side, and are not copied. */
const transferables = (message: unknown): Array<Transferable> => {
  const args = (message as { readonly _tag?: string; readonly args?: ReadonlyArray<unknown> })._tag === "action" ? ((message as { readonly args: ReadonlyArray<unknown> }).args) : []
  return args.flatMap((arg) => (typeof arg === "object" && arg !== null && (arg as { readonly bytes?: unknown }).bytes instanceof ArrayBuffer ? [(arg as { readonly bytes: ArrayBuffer }).bytes] : []))
}

/** The first message, with the port: from the page to the plugin. */
const CONNECT = "dhtmlx-effect/connect"

/**
 * The page side: gives the plugin in `iframe` its port, when the iframe has loaded, to `origin`
 * only. Gives the channel to the plugin.
 */
export const openPlugin = (iframe: HTMLIFrameElement, origin: string) =>
  Effect.gen(function* () {
    const { port1, port2 } = new MessageChannel()
    yield* Effect.callback<void>((resume) => {
      const loaded = () => resume(Effect.void)
      iframe.addEventListener("load", loaded, { once: true })
      return Effect.sync(() => iframe.removeEventListener("load", loaded))
    })
    iframe.contentWindow?.postMessage({ _tag: CONNECT }, origin, [port2])
    return yield* portChannel<PluginMessage, HostMessage>(port1, PluginMessageSchema as never, "The channel to the plugin")
  })

/** The plugin side: waits for the port of the page, from `origin` only. Gives the channel to the page. */
export const acceptHost = (origin: string) =>
  Effect.gen(function* () {
    const port = yield* Effect.callback<MessagePort>((resume) => {
      const listener = (event: MessageEvent) => {
        if (event.origin !== origin || (event.data as { _tag?: unknown } | null)?._tag !== CONNECT || event.ports[0] === undefined) return
        window.removeEventListener("message", listener)
        resume(Effect.succeed(event.ports[0]))
      }
      window.addEventListener("message", listener)
      return Effect.sync(() => window.removeEventListener("message", listener))
    })
    return yield* portChannel<HostMessage, PluginMessage>(port, HostMessageSchema as never, "The channel to the page")
  })
