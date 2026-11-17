import { expect, it } from "vitest"

/** The DHTMLX packages: none of them may be in the plugin or the protocol. */
const DHTMLX = ["dhx-suite", "dhtmlx-gantt", "dhtmlx-scheduler", "@dhtmlx/kanban", "@dhtmlx/diagram", "@dhtmlx/richtext", "@dhtmlx/todolist", "@dhtmlx/booking", "@dhtmlx/pivot", "@dhtmlx/spreadsheet", "@dhtmlx/vault"]

/** The bundle of an entry, with the DHTMLX packages left as imports, so an import of one shows in the text. */
const bundle = async (entry: string) => {
  const result = await Bun.build({ entrypoints: [new URL(`../${entry}`, import.meta.url).pathname], target: "browser", external: [...DHTMLX, "effect", "@effect/*"] })
  expect(result.success).toBe(true)
  return (await Promise.all(result.outputs.map((output) => output.text()))).join("\n")
}

it("bundles the plugin with no DHTMLX package in it", async () => {
  const text = await bundle("plugin.ts")
  for (const name of DHTMLX) expect(text.includes(`"${name}`)).toBe(false)
})

it("bundles the protocol with no DHTMLX package in it", async () => {
  const text = await bundle("protocol.ts")
  for (const name of DHTMLX) expect(text.includes(`"${name}`)).toBe(false)
})

it("bundles the host with the DHTMLX that it draws with", async () => {
  expect((await bundle("host.ts")).includes('"dhx-suite')).toBe(true)
})
