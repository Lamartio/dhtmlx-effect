/**
 * What one Gantt costs in a page: builds `planner.entry.ts` (or `gantt.entry.ts`) with Vite, in one chunk for
 * each library, and prints each size minified, gzipped and with brotli. `--out <dir>` keeps the build,
 * with an index.html, for a test of the time to the first draw.
 */
import { brotliCompressSync, gzipSync } from "node:zlib"
import { mkdtemp, readdir, readFile, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { build } from "vite"

const at = process.argv.indexOf("--out")
const out = at === -1 ? await mkdtemp(join(tmpdir(), "dhtmlx-effect-size-")) : process.argv[at + 1]!
const root = join(import.meta.dir, "..")
/** `--gantt-only`: the Gantt with no Toolbar of the Suite, to see what the Suite adds. */
const entry = process.argv.includes("--gantt-only") ? "gantt.entry.ts" : "planner.entry.ts"

const chunkOf = (id: string) =>
  id.includes("/dhtmlx-gantt/") ? "gantt" : id.includes("/dhx-suite/") ? "suite" : id.includes("/effect/") || id.includes("/@effect/") ? "effect" : undefined

await build({
  configFile: false,
  root,
  logLevel: "warn",
  build: {
    outDir: out,
    emptyOutDir: true,
    minify: true,
    cssCodeSplit: false,
    // The Suite and the Gantt are big: that is what this measures.
    chunkSizeWarningLimit: 4000,
    rollupOptions: {
      input: join(root, "scripts", entry),
      output: { entryFileNames: "ours.js", chunkFileNames: "[name].js", assetFileNames: "[name][extname]", manualChunks: chunkOf }
    }
  }
})

const files = (await readdir(out)).filter((file) => /\.(js|css)$/.test(file)).sort()
const kb = (bytes: number) => `${(bytes / 1024).toFixed(1)} KB`
const rows = []
let total = { raw: 0, gzip: 0, brotli: 0 }
for (const file of files) {
  const bytes = await readFile(join(out, file))
  const row = { file, raw: bytes.length, gzip: gzipSync(bytes, { level: 9 }).length, brotli: brotliCompressSync(bytes).length }
  total = { raw: total.raw + row.raw, gzip: total.gzip + row.gzip, brotli: total.brotli + row.brotli }
  rows.push(row)
}
console.log("| File | Minified | Gzip | Brotli |\n|---|---|---|---|")
for (const row of [...rows, { file: "total", ...total }]) console.log(`| ${row.file} | ${kb(row.raw)} | ${kb(row.gzip)} | ${kb(row.brotli)} |`)

if (at !== -1) {
  const scripts = files.filter((file) => file.endsWith(".js")).map((file) => `<script type="module" src="./${file}"></script>`).join("")
  const styles = files.filter((file) => file.endsWith(".css")).map((file) => `<link rel="stylesheet" href="./${file}">`).join("")
  await writeFile(join(out, "index.html"), `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width">${styles}</head><body style="margin:0"><div id="app" style="height:100vh"></div>${scripts}</body></html>`)
}
