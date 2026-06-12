import { describe, expect, it } from "vitest";
import {
  buildProgressSnapshotFromStatusResult,
  calculatePhaseProgress,
  createProgressSnapshot,
  renderProgressSnapshotCompactText,
  renderProgressSnapshotJapaneseAdmin,
  renderProgressSnapshotJson,
  renderProgressSnapshotMarkdown,
  type ProgressPhase,
  type ProgressSnapshot,
} from "./progress-view.js";
import type { StatusResult } from "./status-engine.js";

function makePhase1Tasks(): ProgressPhase["tasks"] {
  return [
    {
      id: "T0",
      issue: 223,
      name: "Phase 0持ち越し台帳",
      status: "done",
      implementationSummary: "Phase 0持ち越し台帳と追加方針を確定",
    },
    {
      id: "T1",
      issue: 222,
      name: "内部dogfood開始ゲート",
      status: "done",
      implementationSummary: "必要証跡を確認し、不足なら開始停止",
    },
    {
      id: "T2",
      issue: 224,
      name: "Phase完了監査ゲート",
      status: "current",
      currentGate: "L2 audit",
      implementationSummary: "完了主張前に証跡と監査を確認",
    },
    {
      id: "T3",
      issue: 225,
      name: "監査証跡台帳",
      status: "pending",
      implementationSummary: "L1/L2/L3/CI/merge/post-mergeを追跡",
    },
    {
      id: "T4",
      issue: 226,
      name: "workflow action registry",
      status: "pending",
      implementationSummary: "操作ごとの停止gateを定義",
    },
    {
      id: "T5",
      issue: 227,
      name: "script-controlled chain",
      status: "pending",
      implementationSummary: "Shirube手順をスクリプト連鎖実行",
    },
    {
      id: "T6",
      issue: 229,
      name: "管理者通知",
      status: "pending",
      implementationSummary: "AUN/Discord非依存で状態変化を通知",
    },
    {
      id: "T7",
      issue: 234,
      name: "進捗可視化のための非常に長い日本語タスク名でもスマートフォン表示が崩れないことを確認する",
      status: "pending",
      implementationSummary: "Phase/Task/進捗%表示を機械生成",
    },
  ];
}

function makeSnapshot(): ProgressSnapshot {
  return createProgressSnapshot({
    projectId: "shirube",
    generatedAt: "2026-06-12T00:00:00.000Z",
    streams: [
      {
        id: "core",
        name: "Shirube core",
        activePhaseId: "phase-1",
        activeTaskId: "T2",
        phases: [
          {
            id: "phase-0",
            name: "Phase 0",
            shortName: "P0",
            intent: "開発ルールと持ち越し整理",
            status: "done",
            tasks: [],
          },
          {
            id: "phase-1",
            name: "Phase 1",
            shortName: "P1",
            intent: "Shirube自身にShirube流を適用し、開始ゲートと監査を実運用",
            status: "current",
            tasks: makePhase1Tasks(),
          },
          {
            id: "phase-2",
            name: "Phase 2",
            shortName: "P2 MVP",
            intent: "MVPとして外部利用可能にする",
            status: "planned",
            tasks: [],
          },
        ],
        currentStep: "#224 PR作成。CI実行中。L1/L2監査待ち",
        nextAction: "CI確認 -> L1/L2監査 -> 指摘対応",
        lastUpdatedAt: "2026-06-12T00:00:00.000Z",
        evidenceSource: "GitHub issue/pr comments",
      },
      {
        id: "hygiene",
        name: "Shirube hygiene",
        activePhaseId: "phase-1",
        activeTaskId: "H1",
        phases: [
          {
            id: "phase-1",
            name: "Phase 1",
            shortName: "P1",
            status: "current",
            tasks: [
              {
                id: "H1",
                issue: 233,
                name: "timeout hygiene",
                status: "review",
                currentGate: "Triage",
                implementationSummary: "Reproduce and classify timeout cause",
              },
            ],
          },
        ],
        currentStep: "Open",
        nextAction: "Reproduce timeout cause",
        lastUpdatedAt: "2026-06-12T00:00:00.000Z",
        evidenceSource: "GitHub issue",
      },
    ],
  });
}

describe("progress-view", () => {
  it("calculates exact and approximate phase progress", () => {
    const exact = calculatePhaseProgress({
      id: "p1",
      name: "Phase 1",
      status: "current",
      tasks: makePhase1Tasks(),
    });
    expect(exact).toEqual({
      percent: 25,
      completedUnits: 2,
      totalTasks: 8,
      approximate: false,
    });

    const approximate = calculatePhaseProgress({
      id: "p1",
      name: "Phase 1",
      status: "current",
      tasks: [
        { id: "T1", name: "Done", status: "done" },
        { id: "T2", name: "Current", status: "current", progressCredit: 0.5 },
      ],
    });
    expect(approximate).toEqual({
      percent: 75,
      completedUnits: 1.5,
      totalTasks: 2,
      approximate: true,
    });
  });

  it("renders multi-stream markdown tables and nearby summaries", () => {
    const markdown = renderProgressSnapshotMarkdown(makeSnapshot());

    expect(markdown).toContain("| Stream | Phase | Current task | Gate | Status | Next |");
    expect(markdown).toContain("Shirube core");
    expect(markdown).toContain("T2 #224 Phase完了監査ゲート");
    expect(markdown).toContain("L2 audit");
    expect(markdown).toContain("Shirube hygiene");
    expect(markdown).toContain("### Nearby: Shirube core");
    expect(markdown).toContain("Previous | T1 #222 内部dogfood開始ゲート");
    expect(markdown).toContain("Current | T2 #224 Phase完了監査ゲート");
    expect(markdown).toContain("Next | T3 #225 監査証跡台帳");
  });

  it("renders compact text output for short notifications", () => {
    const text = renderProgressSnapshotCompactText(makeSnapshot());

    expect(text).toContain("Progress Snapshot");
    expect(text).toContain("[##------] T2 #224 Phase完了監査ゲート 25% (2/8)");
    expect(text).toContain("Gate: L2 audit");
    expect(text).toContain("Next: CI確認 -> L1/L2監査 -> 指摘対応");
  });

  it("renders Discord-safe Japanese admin progress with every current-phase task", () => {
    const text = renderProgressSnapshotJapaneseAdmin(makeSnapshot(), {
      maxLineLength: 88,
    });

    expect(text).toContain("進捗: P1/T2 #224 25% (2/8)");
    expect(text).toContain("目的: Shirube自身にShirube流を適用し、開始ゲートと監査を実運用");
    expect(text).toContain("Phase: P0完了 / P1現在 / P2 MVP");
    expect(text).toContain("☑︎ T0 #223");
    expect(text).toContain("☑︎ T1 #222");
    expect(text).toContain("→ T2 #224");
    for (const id of ["T3", "T4", "T5", "T6", "T7"]) {
      expect(text).toContain(`  ${id}`);
    }
    expect(text).not.toContain("[pending]");
    expect(Math.max(...text.split("\n").map((line) => Array.from(line).length))).toBeLessThanOrEqual(88);
  });

  it("renders a long Japanese management view", () => {
    const text = renderProgressSnapshotJapaneseAdmin(makeSnapshot(), {
      mode: "long",
    });

    expect(text).toContain("Shirube core 開発進捗");
    expect(text).toContain("Phase一覧");
    expect(text).toContain("[current] Phase 1");
    expect(text).toContain("Nearby");
    expect(text).toContain("前: T1 #222 内部dogfood開始ゲート");
  });

  it("serializes JSON output for tooling", () => {
    const json = renderProgressSnapshotJson(makeSnapshot());
    const parsed = JSON.parse(json) as ProgressSnapshot;

    expect(parsed.schemaVersion).toBe("progress-snapshot/v1");
    expect(parsed.streams).toHaveLength(2);
    expect(parsed.streams[0].activeTaskId).toBe("T2");
  });

  it("builds a transitional snapshot from status-engine output", () => {
    const status: StatusResult = {
      currentPhase: 4,
      phaseLabel: "Implementation",
      overallProgress: 50,
      profile: null,
      gates: null,
      phases: [
        { number: 3, label: "Planning", status: "completed" },
        { number: 4, label: "Implementation", status: "active" },
      ],
      documents: [],
      tasks: [
        { id: "T1", featureId: "F1", name: "Done task", status: "done" },
        { id: "T2", featureId: "F1", name: "Active task", status: "in_progress" },
      ],
      execution: null,
      audits: [],
      stalenessWarnings: [],
    };

    const snapshot = buildProgressSnapshotFromStatusResult("demo", status, {
      generatedAt: "2026-06-12T00:00:00.000Z",
    });

    expect(snapshot.streams[0].activePhaseId).toBe("phase-4");
    expect(snapshot.streams[0].activeTaskId).toBe("T2");
    expect(renderProgressSnapshotCompactText(snapshot)).toContain("T2 Active task");
  });
});
