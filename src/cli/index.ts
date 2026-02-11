#!/usr/bin/env node
import { Command } from "commander";
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

const program = new Command();

program
  .name("framework")
  .description(
    "AI Development Framework CLI - Automates the development lifecycle from discovery to deployment",
  )
  .version("0.1.0");

// Core workflow
registerInitCommand(program);
registerDiscoverCommand(program);
registerGenerateCommand(program);
registerPlanCommand(program);
registerAuditCommand(program);
registerRunCommand(program);
registerStatusCommand(program);

// Project management
registerRetrofitCommand(program);
registerUpdateCommand(program);

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

program.parse();
