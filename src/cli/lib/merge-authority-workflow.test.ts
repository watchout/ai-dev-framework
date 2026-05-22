import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

describe("merge authority workflow template", () => {
  it("uses pull_request_review events for review state changes", () => {
    const workflow = fs.readFileSync(
      path.join(process.cwd(), "templates/ci/merge-authority.yml"),
      "utf-8",
    );

    expect(workflow).toContain("name: \"shirube merge-authority\"");
    expect(workflow).toContain("pull_request:");
    expect(workflow).toContain("types: [opened, synchronize, reopened, ready_for_review, labeled, unlabeled]");
    expect(workflow).toContain("pull_request_review:");
    expect(workflow).toContain("types: [submitted, edited, dismissed]");
    expect(workflow).not.toContain("review_submitted");
    expect(workflow).not.toContain("npm run shirube -- merge-authority");
    expect(workflow).toContain("repository: watchout/ai-dev-framework");
    expect(workflow).toContain("working-directory: target");
    expect(workflow).toContain("node ../shirube-runtime/dist/cli/index.js merge-authority");
  });
});
