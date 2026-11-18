import { Schema } from "effect"

/**
 * The few Tailwind classes that a node may have: spacing, a place for a node such as a floating
 * button, the alignment of the children of a frame, and the size and style of text. No colors and
 * no theme: the page decides those. `scripts/utilities.ts` builds the CSS of
 * exactly this list into `src/utilities.css`, so a page needs no Tailwind.
 */
const SCALE = ["0", "0.5", "1", "2", "3", "4", "6", "8"] as const
const SPACING = ["m", "mx", "my", "mt", "mr", "mb", "ml", "p", "px", "py", "pt", "pr", "pb", "pl", "gap"] as const
const AUTO = ["m", "mx", "my", "mt", "mr", "mb", "ml"] as const
const INSETS = ["inset", "top", "right", "bottom", "left"] as const

export const UTILITIES = [
  ...SPACING.flatMap((name) => SCALE.map((step) => `${name}-${step}` as const)),
  ...AUTO.map((name) => `${name}-auto` as const),
  "relative",
  "absolute",
  "sticky",
  ...INSETS.flatMap((name) => (["0", "2", "4", "6"] as const).map((step) => `${name}-${step}` as const)),
  "z-10",
  "z-20",
  "z-50",
  "self-start",
  "self-center",
  "self-end",
  "self-stretch",
  // The children of a column or a row: the frame gives the direction, and `size` the flex of a child.
  "flex-wrap",
  "flex-nowrap",
  ...(["start", "center", "end", "stretch", "baseline"] as const).map((place) => `items-${place}` as const),
  ...(["start", "center", "end", "between", "around", "evenly"] as const).map((place) => `justify-${place}` as const),
  // Text: the font of the page, in another size, weight or style.
  ...(["xs", "sm", "base", "lg", "xl", "2xl"] as const).map((size) => `text-${size}` as const),
  ...(["normal", "medium", "semibold", "bold"] as const).map((weight) => `font-${weight}` as const),
  "italic",
  "not-italic",
  "text-left",
  "text-center",
  "text-right",
  "uppercase",
  "normal-case"
] as const

export type Utility = (typeof UTILITIES)[number]

/** The classes of a node, checked against the list: a class that is not in it fails the decode. */
export const Classes = Schema.optional(Schema.Array(Schema.Literals(UTILITIES)))
