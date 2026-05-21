/**
 * shirube migrate-to-v1.2 — Convert v1.1 SSOT docs to v1.2 4-layer docs.
 */
import type { Command } from 'commander';
import { migrateToV12 } from '../lib/v12-migration-engine.js';

function printResult(result: Awaited<ReturnType<typeof migrateToV12>>): void {
  const verb = result.dryRun ? 'Would generate' : 'Generated';
  console.log(`Discovered ${result.discoveredFeatures.length} feature(s).`);
  if (result.skippedFeatures.length > 0) {
    console.log(`Skipped ${result.skippedFeatures.length} feature(s).`);
  }
  console.log(`${verb} ${result.generatedFiles.length} file(s).`);

  if (result.skippedFeatures.length > 0) {
    console.log('');
    console.log('Skipped features:');
    for (const skipped of result.skippedFeatures) {
      console.log(`  - ${skipped.id}: ${skipped.reason}`);
    }
  }

  if (result.skippedFiles.length > 0) {
    console.log('');
    console.log(`Skipped ${result.skippedFiles.length} file(s):`);
    for (const skipped of result.skippedFiles) {
      console.log(`  - ${skipped.path}: ${skipped.reason}`);
    }
  }

  if (result.generatedFiles.length > 0) {
    console.log('');
    console.log(result.dryRun ? 'Planned files:' : 'Generated files:');
    for (const file of result.generatedFiles) {
      console.log(`  - ${file}`);
    }
  }

  if (result.configUpdated) {
    console.log('');
    console.log('Updated .framework/config.json: docs_layers.enabled=true');
  }
  if (result.reportPath) {
    console.log(`Migration report: ${result.reportPath}`);
  }
  if (result.dryRun) {
    console.log('');
    console.log('This was a dry-run. Re-run without --dry-run to write files.');
  }
}

export function registerMigrateToV12Command(program: Command): void {
  program
    .command('migrate-to-v1.2')
    .description('Migrate v1.1 SSOT markdown to v1.2 SPEC/IMPL/VERIFY/OPS docs')
    .option('--dry-run', 'Print planned files without writing')
    .option('--ssot <path>', 'Path to v1.1 SSOT markdown file')
    .option('--output-dir <path>', 'Directory where SPEC/IMPL/VERIFY/OPS docs are written')
    .action(async (options: { dryRun?: boolean; ssot?: string; outputDir?: string }) => {
      try {
        const result = await migrateToV12(process.cwd(), {
          dryRun: options.dryRun ?? false,
          ssotPath: options.ssot,
          outputDir: options.outputDir,
        });
        printResult(result);
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        console.error(`Migration failed: ${message}`);
        process.exitCode = 2;
      }
    });
}
