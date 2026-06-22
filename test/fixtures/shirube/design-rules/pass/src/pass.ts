export function formatDisplayName(firstName: string, lastName: string): string {
  return `${firstName} ${lastName}`.trim();
}

export function isDisplayNamePresent(value: string): boolean {
  return value.trim().length > 0;
}
