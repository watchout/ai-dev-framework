export function firstInvoice(input: number): number {
  const base = input + 1;
  const tax = base * 0.1;
  const service = base * 0.05;
  const discount = base > 100 ? 5 : 0;
  const subtotal = base + tax;
  const adjusted = subtotal - discount;
  const total = adjusted + service;
  const rounded = Math.round(total);
  const capped = Math.min(rounded, 999);
  const normalized = Math.max(capped, 0);
  return normalized;
}

export function secondInvoice(input: number): number {
  const base = input + 1;
  const tax = base * 0.1;
  const service = base * 0.05;
  const discount = base > 100 ? 5 : 0;
  const subtotal = base + tax;
  const adjusted = subtotal - discount;
  const total = adjusted + service;
  const rounded = Math.round(total);
  const capped = Math.min(rounded, 999);
  const normalized = Math.max(capped, 0);
  return normalized;
}
