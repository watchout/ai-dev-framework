const COLORS = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  cyan: "\x1b[36m",
} as const;

function colorize(color: keyof typeof COLORS, text: string): string {
  return `${COLORS[color]}${text}${COLORS.reset}`;
}

export const logger = {
  info(message: string): void {
    process.stdout.write(`${message}\n`);
  },

  success(message: string): void {
    process.stdout.write(`${colorize("green", "+")} ${message}\n`);
  },

  warn(message: string): void {
    process.stderr.write(
      `${colorize("yellow", "warning")} ${message}\n`,
    );
  },

  error(message: string): void {
    process.stderr.write(`${colorize("red", "error")} ${message}\n`);
  },

  step(current: number, total: number, message: string): void {
    process.stdout.write(
      `${colorize("dim", `[${current}/${total}]`)} ${message}\n`,
    );
  },

  header(message: string): void {
    process.stdout.write(`\n${colorize("bold", message)}\n`);
  },

  dim(message: string): void {
    process.stdout.write(`${colorize("dim", message)}\n`);
  },

  tree(lines: string[]): void {
    for (const line of lines) {
      process.stdout.write(`  ${line}\n`);
    }
  },
};
