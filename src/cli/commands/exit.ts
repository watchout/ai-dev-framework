/**
 * framework exit — Deactivate framework mode.
 *
 * Part of #63 (09_ENFORCEMENT §1 Exit).
 *
 * Requires FRAMEWORK_BYPASS CEO secret token.
 * Removes `framework-managed` repo topic → all hooks become no-ops.
 * Logs exit event to audit log (§2).
 */
import type { Command } from "commander";
import { deactivateFrameworkMode, getFrameworkMode } from "../lib/framework-mode.js";
import { logFrameworkExit } from "../lib/audit-log.js";

export function registerExitCommand(program: Command): void {
  program
    .command("exit")
    .description("Deactivate framework mode (CEO token required)")
    .option("--reason <reason>", "Reason for exiting framework mode")
    .action(async (options: { reason?: string }) => {
      const token = process.env.FRAMEWORK_BYPASS;
      if (!token) {
        console.error("❌ FRAMEWORK_BYPASS environment variable required.");
        console.error("");
        console.error("Usage:");
        console.error("  FRAMEWORK_BYPASS=<ceo-token> framework exit --reason \"...\"");
        console.error("");
        console.error("This command requires CEO authorization.");
        process.exit(1);
      }

      const reason = options.reason ?? "No reason provided";

      // Check current mode
      const currentMode = await getFrameworkMode();
      if (currentMode === "inactive") {
        console.log("Framework mode is already inactive.");
        return;
      }
      if (currentMode === "unknown") {
        console.warn("⚠️  Could not determine framework mode (gh unavailable).");
        console.warn("Attempting deactivation anyway...");
      }

      // Deactivate
      const result = await deactivateFrameworkMode(token);
      if (!result.ok) {
        console.error(`❌ Deactivation failed: ${result.error}`);
        process.exit(1);
      }

      // Audit log
      const logged = await logFrameworkExit(reason);

      console.log("✅ Framework mode deactivated.");
      console.log("   Topic 'framework-managed' removed from repo.");
      console.log("   All hooks are now passthrough (no-ops).");
      if (logged) {
        console.log("   Exit event recorded in audit log.");
      } else {
        console.warn("   ⚠️  Audit log recording failed (non-blocking).");
      }
      console.log("");
      console.log("To reactivate: framework init / framework retrofit");
    });
}
