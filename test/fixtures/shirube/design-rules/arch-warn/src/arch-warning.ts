export const bookingStatuses = ["new", "held", "charged", "refunded"];

export function statusLabel(status: string): string {
  // TODO configurable: move booking statuses into repository-owned config.
  return bookingStatuses.includes(status) ? status : "new";
}
