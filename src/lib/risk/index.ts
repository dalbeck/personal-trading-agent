import { RISK_LIMITS } from "@strategy/charter.config";
import { RULES } from "./validators";
import type {
  ProposedOrder,
  RiskContext,
  RiskDecision,
  RiskLimits,
  Violation,
} from "./types";

/**
 * The hard risk gate. Runs every charter rail against a proposed order and
 * returns the verdict. A non-empty `violations` list means the order is
 * **rejected** — the engine journals it as a rejection (it does not retry or
 * silently downsize). This is enforced in code; the LLM cannot bypass it.
 *
 * Defaults to the charter config, but accepts an explicit `limits` for tests.
 */
export function evaluateOrder(
  order: ProposedOrder,
  ctx: RiskContext,
  limits: RiskLimits = RISK_LIMITS,
): RiskDecision {
  const violations = RULES.map((rule) => rule(order, ctx, limits)).filter(
    (v): v is Violation => v !== null,
  );
  return { ok: violations.length === 0, violations };
}

export { RISK_LIMITS } from "@strategy/charter.config";
export { RULES } from "./validators";
export type {
  AssetClass,
  HeldPosition,
  OrderAction,
  OrderType,
  ProposedOrder,
  RiskContext,
  RiskDecision,
  RiskLimits,
  Side,
  Violation,
} from "./types";
