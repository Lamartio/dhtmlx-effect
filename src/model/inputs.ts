import { Effect, type Scope, type Stream, SubscriptionRef } from "effect"
import { changesOf, type Entry, history, type Input, input, recordInput } from "./model"

/**
 * The models of the inputs of a form: Calendar, Timepicker, Slider, Colorpicker and Combobox. Each
 * one holds one value, and the user has one action: `set`.
 */
export type ValueModel<A> = {
  /** The value. The renderer shows each change of it, and the caller can set it too. */
  readonly value: SubscriptionRef.SubscriptionRef<A>
  /** What the user does: chooses a value. A value that is the same as the one now changes nothing. */
  readonly set: (value: A) => Effect.Effect<void>
  /** The last entries, as many as `history` says. */
  readonly recent: Effect.Effect<ReadonlyArray<Entry>>
  /** The state now, to compare, or to hash with `hashOf`. */
  readonly snapshot: Effect.Effect<{ readonly value: A }>
  /** One `void` on each change of the state: see `changesOf`. */
  readonly changes: Stream.Stream<void>
}

/** The actions of a `ValueModel`, by name. */
export const VALUE_ACTIONS = ["set"] as const satisfies ReadonlyArray<keyof ValueModel<unknown>>

export type ValueOptions<A> = {
  readonly value?: Input<A>
  /** How many entries `recent` keeps. Default: 0. */
  readonly history?: number
}

/**
 * A model with one value. `same` tells two values that are the same for the user, such as a colour
 * in capitals or not. `accepts` refuses a value that the widget cannot show, such as an option that
 * is not in a combobox.
 */
export const valueModel = <A>(
  options: ValueOptions<A>,
  initial: A,
  rules: { readonly same?: (a: A, b: A) => boolean; readonly accepts?: (value: A) => boolean } = {}
): Effect.Effect<ValueModel<A>, never, Scope.Scope> =>
  Effect.gen(function* () {
    const same = rules.same ?? Object.is
    const value = yield* input(options.value, initial)
    const log = yield* history(options.history ?? 0)
    yield* recordInput(log, "value", value)
    return {
      value,
      set: (next) =>
        Effect.gen(function* () {
          if (rules.accepts !== undefined && !rules.accepts(next)) return
          yield* log.record({ _tag: "action", name: "set", value: next })
          if (!same(yield* SubscriptionRef.get(value), next)) yield* SubscriptionRef.set(value, next)
        }),
      recent: log.recent,
      snapshot: Effect.map(SubscriptionRef.get(value), (now) => ({ value: now })),
      changes: changesOf(value)
    }
  })

/** A Calendar: the day as `YYYY-MM-DD`, or undefined for none. */
export const calendarModel = (options: ValueOptions<string | undefined> = {}) => valueModel(options, undefined)

/** A Timepicker: the time as `HH:mm`, 24 hours. */
export const timepickerModel = (options: ValueOptions<string> = {}) => valueModel(options, "09:00")

/** A Slider with one thumb. It starts at `min`. */
export const sliderModel = (options: ValueOptions<number> & { readonly min?: number } = {}) => valueModel(options, options.min ?? 0)

/** A Colorpicker: the colour as `#rrggbb`, the same in capitals or not. */
export const colorpickerModel = (options: ValueOptions<string> = {}) =>
  valueModel(options, "#2e7dd1", { same: (a, b) => a.toLowerCase() === b.toLowerCase() })

/** A Combobox with one choice: the value of the chosen option, or undefined. A value that is not an option is refused. */
export const comboboxModel = (options: ValueOptions<string | undefined> & { readonly options: ReadonlyArray<{ readonly value: string }> }) =>
  valueModel(options, undefined, { accepts: (value) => value === undefined || options.options.some((option) => option.value === value) })
