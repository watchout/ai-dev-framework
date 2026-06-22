export function firstTotal(input: number): number {
  const base = input + 1;
  const tax = base * 0.1;
  const service = base * 0.05;
  const subtotal = base + tax;
  const total = subtotal + service;
  return Math.round(total);
}

export function secondTotal(input: number): number {
  const base = input + 1;
  const tax = base * 0.1;
  const service = base * 0.05;
  const subtotal = base + tax;
  const total = subtotal + service;
  return Math.round(total);
}
