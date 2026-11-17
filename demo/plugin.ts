/**
 * The plugin, in the frame of the sender: it takes the port of the page, keeps the models, sends
 * their state, and runs each action of the page. The sender tells it each new version of `ui.ts`
 * (an EventSource), and gets each action in its log.
 */
import { Effect, Layer, Queue, Schema, Stream } from "effect"
import { acceptHost, bindTree, servePlugin, type Ui, UiSchema, UiState, uiState } from "../src/plugin"

const HOST = String(new URLSearchParams(location.search).get("host") ?? "http://localhost:4100")

const decode = Schema.decodeUnknownSync(UiSchema)

const log = (line: unknown) => void fetch("/log", { method: "POST", body: JSON.stringify(line) })

const program = Effect.gen(function* () {
  const ui = yield* UiState
  const versions = Stream.callback<Ui>((queue) =>
    Effect.acquireRelease(
      Effect.sync(() => {
        const source = new EventSource("/ui")
        source.onmessage = (event) => Effect.runFork(Queue.offer(queue, decode(JSON.parse(event.data))))
        return source
      }),
      (source) => Effect.sync(() => source.close())
    ))
  // Each version of ui.ts: the models stay by id, and only what changed goes to the page.
  yield* bindTree(versions)
  const channel = yield* acceptHost(HOST)
  // Each message of the page goes into the log of the sender, then to the plugin.
  yield* servePlugin(ui, { ...channel, messages: channel.messages.pipe(Stream.tap((message) => Effect.sync(() => log(message)))) })
  yield* Effect.never
})

Effect.runFork(program.pipe(Effect.provide(Layer.effect(UiState)(uiState)), Effect.scoped))
