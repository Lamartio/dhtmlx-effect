import { it } from "@effect/vitest"
import { Effect, SubscriptionRef } from "effect"
import { expect } from "vitest"
import "@dhtmlx/pivot/dist/pivot.css"
import { alive, Host } from "./host"
import { pivot, type PivotConfig, type PivotField } from "./pivot"
import { run, settle } from "./wx-test"

const FIELDS: ReadonlyArray<PivotField> = [
  { id: "region", label: "Region", type: "text" },
  { id: "product", label: "Product", type: "text" },
  { id: "sales", label: "Sales", type: "number" }
]

const ROWS = [
  { region: "North", product: "Apples", sales: 10 },
  { region: "North", product: "Pears", sales: 5 },
  { region: "South", product: "Apples", sales: 7 },
  { region: "South", product: "Pears", sales: 3 }
]

const BY_REGION: PivotConfig = { rows: ["region"], columns: [], values: [{ field: "sales", method: "sum" }] }

const wait = Effect.gen(function* () {
  yield* settle
  yield* settle
})

it.live("builds the table from the rows and the config, and follows new rows", () =>
  run(Effect.gen(function* () {
    const host = yield* Host
    const rows = yield* SubscriptionRef.make<ReadonlyArray<Readonly<Record<string, unknown>>>>(ROWS)
    const config = yield* SubscriptionRef.make(BY_REGION)
    yield* pivot({ rows, fields: FIELDS, config, configPanel: false })
    yield* wait
    expect(host.textContent).toContain("North")
    expect(host.textContent).toContain("South")
    // 10 + 5 for North.
    expect(host.textContent).toContain("15")

    yield* SubscriptionRef.set(rows, [...ROWS, { region: "West", product: "Apples", sales: 20 }])
    yield* wait
    expect(host.textContent).toContain("West")
    // The table only showed the config: the store has the same value.
    expect(yield* SubscriptionRef.get(config)).toBe(BY_REGION)
    expect((yield* SubscriptionRef.get(alive)).get("pivot")).toBe(1)
  })))

it.live("keeps the config both ways: from the code, and from the panel of the user", () =>
  run(Effect.gen(function* () {
    const host = yield* Host
    const rows = yield* SubscriptionRef.make<ReadonlyArray<Readonly<Record<string, unknown>>>>(ROWS)
    const config = yield* SubscriptionRef.make(BY_REGION)
    const made = yield* pivot({ rows, fields: FIELDS, config, configPanel: false })
    yield* wait

    // From the code.
    yield* SubscriptionRef.set(config, { rows: ["product"], columns: [], values: [{ field: "sales", method: "sum" }] })
    yield* wait
    expect(host.textContent).toContain("Apples")
    expect(host.textContent).not.toContain("North")

    // What the panel does when the user changes the build.
    void made.pivot.api.exec("update-config", { rows: ["region"], columns: ["product"], values: [{ field: "sales", method: "max" }] })
    yield* wait
    expect(yield* SubscriptionRef.get(config)).toMatchObject({ rows: ["region"], columns: ["product"], values: [{ field: "sales", method: "max" }] })
  })))
