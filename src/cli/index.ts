#!/usr/bin/env node
import { Command } from "commander";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { registerInitCommand } from "./commands/init.js";
import { registerDiscoverCommand } from "./commands/discover.js";
import { registerGenerateCommand } from "./commands/generate.js";
import { registerPlanCommand } from "./commands/plan.js";
import { registerAuditCommand } from "./commands/audit.js";
import { registerRunCommand } from "./commands/run.js";
import { registerStatusCommand } from "./commands/status.js";
import { registerRetrofitCommand } from "./commands/retrofit.js";
import { registerUpdateCommand } from "./commands/update.js";
import { registerCheckpointCommand } from "./commands/checkpoint.js";
import { registerVerifyCommand } from "./commands/verify.js";
import { registerSkillCreateCommand } from "./commands/skill-create.js";
import { registerCompactCommand } from "./commands/compact.js";
import { registerSessionCommands } from "./commands/session.js";
import { registerTestCommand } from "./commands/test.js";
import { registerCICommand } from "./commands/ci.js";
import { registerVisualTestCommand } from "./commands/visual-test.js";
import { registerAcceptCommand } from "./commands/accept.js";
import { registerDeployCommand } from "./commands/deploy.js";
import { registerGateCommand } from "./commands/gate.js";
import { registerFeedbackCommand } from "./commands/feedback.js";
import { registerProjectsCommand } from "./commands/projects.js";
import { registerNextCommand } from "./commands/next.js";
import { registerBlockCommand } from "./commands/block.js";
import { registerSyncCommand } from "./commands/sync.js";
import { registerResequenceCommand } from "./commands/resequence.js";
import { registerPruneCommand } from "./commands/prune.js";
import { registerConfigCommand } from "./commands/config.js";
import { registerImproveCommand } from "./commands/improve.js";
import { registerIngestCommand } from "./commands/ingest.js";
import { registerCheckCommand } from "./commands/check.js";
import { registerMigrateCommand } from "./commands/migrate.js";

// Read version from package.json
const __dirname = dirname(fileURLToPath(import.meta.url));
const packageJson = JSON.parse(
  readFileSync(join(__dirname, "../../package.json"), "utf-8"),
);
const version = packageJson.version;

const program = new Command();

program
  .name("framework")
  .description(
    "AI Development Framework CLI - Automates the development lifecycle from discovery to deployment",
  )
  .version(version);

// Core workflow
registerInitCommand(program);
registerDiscoverCommand(program);
registerGenerateCommand(program);
registerPlanCommand(program);
registerGateCommand(program);
registerAuditCommand(program);
registerRunCommand(program);
registerNextCommand(program);
registerBlockCommand(program);
registerSyncCommand(program);
registerResequenceCommand(program);
registerPruneCommand(program);
registerStatusCommand(program);

// Design ingest
registerIngestCommand(program);

// Deterministic pre-checks
registerCheckCommand(program);

// Project management
registerRetrofitCommand(program);
registerUpdateCommand(program);
registerFeedbackCommand(program);
registerProjectsCommand(program);

// Verification & quality
registerCheckpointCommand(program);
registerVerifyCommand(program);
registerTestCommand(program);
registerVisualTestCommand(program);
registerAcceptCommand(program);

// CI/CD & deployment
registerCICommand(program);
registerDeployCommand(program);

// AI development tools
registerSkillCreateCommand(program);
registerCompactCommand(program);
registerSessionCommands(program);
registerConfigCommand(program);
registerImproveCommand(program);
registerMigrateCommand(program);

program.parse();
