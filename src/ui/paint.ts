import { awaitRedraw } from "dhx-suite"
import { Effect } from "effect"
import { track } from "../core/tally"

/**
 * As `resource`, for a widget that paints on the next frame after a change, such as a DHTMLX Form:
 * its destructor waits for that paint, as a paint after the destructor throws in DHTMLX.
 */
export const resourceAfterPaint = <A>(kind: string, make: () => A, destroy: (a: A) => void) =>
  Effect.acquireRelease(
    Effect.sync(() => ({ value: make(), gone: track(kind) })),
    ({ value, gone }) =>
      Effect.promise(async () => {
        await awaitRedraw()
        await awaitRedraw()
      }).pipe(
        Effect.andThen(Effect.sync(() => {
          try {
            destroy(value)
          } finally {
            gone()
          }
        }))
      )
  ).pipe(Effect.map(({ value }) => value))
