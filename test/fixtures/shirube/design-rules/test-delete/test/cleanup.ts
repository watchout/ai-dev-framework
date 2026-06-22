import { unlinkSync } from "node:fs";

export function cleanupFixture(path: string): void {
  unlinkSync(path);
}
