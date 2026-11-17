/**
 * The demo of a plugin in a frame: two servers, so two origins.
 *
 * - The host (port 4100) gives the page that draws the UI.
 * - The sender (port 4101) gives the plugin, watches `demo/ui.ts`, sends each new version to the
 *   plugin, and logs each action that the page sends.
 *
 * Run: `bun run demo`, then open http://localhost:4100.
 */
import { Schema } from "effect"
import { watch } from "node:fs"
import { join } from "node:path"
import host from "./host.html"
import plugin from "./plugin.html"
import { UiSchema } from "../src/plugin"

const HOST_PORT = Number(process.env["HOST_PORT"] ?? 4100)
const PLUGIN_PORT = Number(process.env["PLUGIN_PORT"] ?? 4101)
const FILE = join(import.meta.dir, "ui.ts")

/**
 * The file as it is now, as JSON from its Schema: imported again, with a new query, so Bun does not
 * give the old module. A node that `.make` refuses stops the import, and the plugin keeps the last UI.
 */
const load = async () => JSON.stringify(Schema.encodeSync(UiSchema)((await import(`${FILE}?v=${Date.now()}`)).default))

let current = await load()
const listeners = new Set<(data: string) => void>()

let timer: ReturnType<typeof setTimeout> | undefined
watch(FILE, () => {
  // An editor saves in a few steps: wait until it is done.
  clearTimeout(timer)
  timer = setTimeout(async () => {
    try {
      current = await load()
      console.log(`[sender] ui.ts changed: sent to ${listeners.size} plugin(s)`)
      for (const listener of listeners) listener(current)
    } catch (error) {
      console.error("[sender] ui.ts does not load:", error)
    }
  }, 80)
})

Bun.serve({ port: HOST_PORT, development: true, routes: { "/": host } })

Bun.serve({
  port: PLUGIN_PORT,
  development: true,
  // The event stream of /ui stays open: no time-out when it is quiet.
  idleTimeout: 0,
  routes: {
    "/": plugin,
    "/ui": () => {
      let send: ((data: string) => void) | undefined
      const stream = new ReadableStream<string>({
        start(controller) {
          send = (data) => controller.enqueue(`data: ${data}\n\n`)
          send(current)
          listeners.add(send)
        },
        cancel() {
          if (send !== undefined) listeners.delete(send)
        }
      })
      return new Response(stream, { headers: { "content-type": "text/event-stream", "cache-control": "no-cache" } })
    },
    "/log": {
      POST: async (request) => {
        const message = await request.json()
        if (message._tag === "action") console.log(`[sender] action ${message.n}: ${message.id}.${message.action}(${message.args.map((arg: unknown) => JSON.stringify(arg)).join(", ")})`)
        else console.log("[sender]", JSON.stringify(message))
        return new Response(null, { status: 204 })
      }
    }
  }
})

console.log(`The page:   http://localhost:${HOST_PORT}`)
console.log(`The plugin: http://localhost:${PLUGIN_PORT} (in a frame of the page)`)
console.log("Change demo/ui.ts and save; actions in the page show here.")
