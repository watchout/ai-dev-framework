import { isMain, parseArgs, readStructuredFile, safeRun } from "./lib.mjs";
import { validateRepoSpec } from "./repo-spec-validator.mjs";

export function runRepoSpecCheck(options = {}) {
  const file = options.fixture ?? options.file ?? ".shirube/repo-spec.yaml";
  const spec = readStructuredFile(file);
  return validateRepoSpec(spec, file);
}

if (isMain(import.meta.url)) {
  const { options } = parseArgs(process.argv.slice(2));
  safeRun(() => runRepoSpecCheck(options));
}
