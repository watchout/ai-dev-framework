/**
 * framework block / framework unblock
 *
 * Add or remove the 'hold' label on a PR to prevent / resume auto-merge.
 *
 * Design: docs/TASK-SEQUENCE-DESIGN.md §6
 * Issue: #28
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { type Command } from "commander";
import { logger } from "../lib/logger.js";

const execFileAsync = promisify(execFile);

async function gh(args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("gh", args);
  return stdout.trim();
}

export function registerBlockCommand(program: Command): void {
  program
    .command("block")
    .description("Add 'hold' label to PR — prevent auto-merge")
    .argument("<pr>", "PR number")
    .action(async (pr: string) => {
      try {
        await gh(["pr", "edit", pr, "--add-label", "hold"]);
        logger.success(`PR #${pr}: 'hold' ラベルを付与しました。自動マージは停止されます。`);
        logger.info("  解除するには: framework unblock " + pr);
      } catch (err) {
        logger.error(`PR #${pr} へのラベル付与に失敗しました: ${err}`);
        process.exit(1);
      }
    });

  program
    .command("unblock")
    .description("Remove 'hold' label from PR — resume auto-merge")
    .argument("<pr>", "PR number")
    .action(async (pr: string) => {
      try {
        await gh(["pr", "edit", pr, "--remove-label", "hold"]);
        logger.success(`PR #${pr}: 'hold' ラベルを削除しました。自動マージが再開されます。`);
      } catch (err) {
        logger.error(`PR #${pr} のラベル削除に失敗しました: ${err}`);
        process.exit(1);
      }
    });
}
