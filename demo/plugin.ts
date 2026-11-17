/**
 * The plugin, in the frame of the sender: it takes the port of the page, keeps the models, sends
 * their state, and runs each action of the page. The sender tells it each new version of `ui.ts`
 * (an EventSource), and gets each action in its log.
 */
import { Effect, Layer, Queue, Stream } from "effect"
import { servePlugin } from "../src/model/remote"
import { publishTree } from "../src/model/tree"
import { acceptHost } from "../src/model/transport"
import { UiState, uiState } from "../src/model/ui-state"
import { plugin, type Spec } from "./spec"

const HOST = String(new URLSearchParams(location.search).get("host") ?? "http://localhost:4100")

const log = (line: unknown) => void fetch("/log", { method: "POST", body: JSON.stringify(line) })

const program = Effect.gen(function* () {
  const ui = yield* UiState
  const { tree, load } = yield* plugin
  yield* publishTree(tree)
  const versions = Stream.callback<Spec>((queue) =>
    Effect.acquireRelease(
      Effect.sync(() => {
        const source = new EventSource("/ui")
        source.onmessage = (event) => Effect.runFork(Queue.offer(queue, JSON.parse(event.data) as Spec))
        return source
      }),
      (source) => Effect.sync(() => source.close())
    ))
  yield* versions.pipe(Stream.runForEach(load), Effect.forkScoped)
  const channel = yield* acceptHost(HOST)
  // Each message of the page goes into the log of the sender, then to the plugin.
  yield* servePlugin(ui, { ...channel, messages: channel.messages.pipe(Stream.tap((message) => Effect.sync(() => log(message)))) })
  yield* Effect.never
})

Effect.runFork(program.pipe(Effect.provide(Layer.effect(UiState)(uiState)), Effect.scoped))
