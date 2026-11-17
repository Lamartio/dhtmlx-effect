import { stableJson } from "./model"

/**
 * The changes from one JSON value to the next, as JSON Patch (RFC 6902) with three ops: `add`,
 * `replace` and `remove`. A path is a JSON Pointer (RFC 6901): `/grid/selected`. A key with the value
 * `undefined` is no key, as in `JSON.stringify`: a field that becomes `undefined` is a `remove`.
 */
export type PatchOp =
  | { readonly op: "add"; readonly path: string; readonly value: unknown }
  | { readonly op: "replace"; readonly path: string; readonly value: unknown }
  | { readonly op: "remove"; readonly path: string }

export type Patch = ReadonlyArray<PatchOp>

const pointer = (path: string, key: string | number) => `${path}/${String(key).replace(/~/g, "~0").replace(/\//g, "~1")}`
const keys = (path: string) => (path === "" ? [] : path.slice(1).split("/").map((key) => key.replace(/~1/g, "/").replace(/~0/g, "~")))
const isRecord = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value)

/** A value as it goes over the wire: plain JSON, with no `undefined`, and a date as an ISO string. */
export const toJson = (value: unknown): unknown => (value === undefined ? undefined : JSON.parse(JSON.stringify(value)))

const walk = (before: unknown, after: unknown, path: string, ops: Array<PatchOp>) => {
  if (isRecord(before) && isRecord(after)) {
    for (const key of Object.keys(before)) if (after[key] === undefined && before[key] !== undefined) ops.push({ op: "remove", path: pointer(path, key) })
    for (const [key, value] of Object.entries(after)) {
      if (value === undefined) continue
      if (before[key] === undefined) ops.push({ op: "add", path: pointer(path, key), value })
      else walk(before[key], value, pointer(path, key), ops)
    }
    return
  }
  // ponytail: a list of the same length changes item by item, any other list goes again whole. A
  // list that grows or shrinks by one row could be a move or an add by id, if that gets too big.
  if (Array.isArray(before) && Array.isArray(after) && before.length === after.length) {
    after.forEach((value, index) => walk(before[index], value, pointer(path, index), ops))
    return
  }
  if (stableJson(before) !== stableJson(after)) ops.push({ op: "replace", path, value: after })
}

/** The patch from `before` to `after`. Two values that are the same give no ops. */
export const diff = (before: unknown, after: unknown): Patch => {
  const ops: Array<PatchOp> = []
  walk(toJson(before), toJson(after), "", ops)
  return ops
}

/** `state` with the patch on it. The state that it gets is not changed: the parts on the paths are copies. */
export const apply = (state: unknown, patch: Patch): unknown => {
  let root = state
  for (const op of patch) {
    const path = keys(op.path)
    if (path.length === 0) {
      root = op.op === "remove" ? undefined : op.value
      continue
    }
    const set = (node: unknown, at: number): unknown => {
      const key = path[at]!
      const copy: Record<string, unknown> | Array<unknown> = Array.isArray(node) ? [...node] : { ...(node as Record<string, unknown>) }
      const slot = Array.isArray(copy) ? Number(key) : key
      if (at < path.length - 1) (copy as Record<string | number, unknown>)[slot] = set((copy as Record<string | number, unknown>)[slot], at + 1)
      else if (op.op === "remove") {
        if (Array.isArray(copy)) copy.splice(Number(key), 1)
        else delete copy[key]
      } else (copy as Record<string | number, unknown>)[slot] = op.value
      return copy
    }
    root = set(root, 0)
  }
  return root
}
