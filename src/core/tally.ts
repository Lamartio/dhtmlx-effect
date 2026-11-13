/**
 * The DHTMLX objects that live now and that were made, by kind, with no framework. Each wrapper
 * counts here, so a test or a story can see that nothing stays behind after an unmount.
 */
type Counts = ReadonlyMap<string, number>

let live: Counts = new Map()
let made: Counts = new Map()
const listeners = new Set<(live: Counts) => void>()

const bump = (counts: Counts, kind: string, step: 1 | -1): Counts => {
  const next = new Map(counts)
  const value = (next.get(kind) ?? 0) + step
  if (value <= 0) next.delete(kind)
  else next.set(kind, value)
  return next
}

/** Counts one object of this kind as made and alive. Gives the function that counts it as gone. */
export const track = (kind: string): (() => void) => {
  live = bump(live, kind, 1)
  made = bump(made, kind, 1)
  for (const listener of listeners) listener(live)
  let gone = false
  return () => {
    if (gone) return
    gone = true
    live = bump(live, kind, -1)
    for (const listener of listeners) listener(live)
  }
}

export const liveNow = () => live
export const madeSoFar = () => made

/** Calls `listener` with the live counts on each change. Gives the function that stops it. */
export const onLive = (listener: (live: Counts) => void) => {
  listeners.add(listener)
  return () => void listeners.delete(listener)
}
