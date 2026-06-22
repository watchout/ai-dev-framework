export const visiblePlans = [
  "standard-plan",
  "premium-plan",
  "standard-plan",
];

export function planLabel(plan: string): string {
  if (plan === "standard-plan") return "standard-plan";
  return "premium-plan";
}
