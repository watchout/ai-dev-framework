# CLAUDE.md - プロジェクト指示書（Claude Code用）

> Claude Code はこのファイルを自動で読み込みます。
> プロジェクトの全仕様書は docs/ にあります。

---

## ⚠️ AI中断プロトコル（最優先ルール）

以下の場合、即座に作業を中断しユーザーに質問すること:

1. SSOTに記載がない仕様判断が必要な時
2. SSOTの記載が曖昧で複数解釈が可能な時
3. 技術的な選択肢が複数あり判断できない時
4. SSOTと既存実装が矛盾している時
5. 制約・規約に未定義のケースに遭遇した時
6. 変更の影響範囲が判断できない時
7. ビジネス判断が必要な時

「推測で進める」「とりあえず仮で」は禁止。
詳細: docs/standards/21_AI_ESCALATION.md

---

## プロセスゲート強制ルール

```
■ 1アクション = 1ドキュメント（絶対ルール）

  ドキュメント生成を依頼された場合:
  - 1つのドキュメントを生成する
  - 生成結果を表示する
  - ユーザーの確認を待つ
  - ユーザーが承認するまで次に進まない

  「まとめて生成」「一括作成」「効率化のため全部」は禁止。

■ ヒアリング = 1問ずつ（絶対ルール）

  仕様のヒアリングが必要な場合:
  - 1回の発言で1つだけ質問する
  - 必ず具体例を添える
  - 回答を受けてから次の質問をする

  「以下の5点について教えてください」は禁止。

■ ゲートチェック

  以下のタイミングで、前ステップの成果物を検証する:
  - docs/idea/ の4ドキュメント完成 → 事業設計ゲート通過
  - docs/requirements/ の2ドキュメント完成 → プロダクト概要ゲート通過
  - P0機能の全SSOT完成（各 Freeze 2） → 機能仕様ゲート通過
  - docs/design/core/ の3ドキュメント完成 → 技術設計ゲート通過

  ゲート未通過で次のフェーズに進むことは禁止。

■ [要確認] マーカー

  既存資料にない情報を補完する場合:
  - 推測で埋めず「[要確認]」マーカーを付ける
  - [要確認] 項目をユーザーに1つずつ質問する
  - 全ての [要確認] が解消されるまでドキュメントは未完了
```

---

## プロジェクト概要

| 項目 | 内容 |
|------|------|
| プロダクト名 | {{PRODUCT_NAME}} |
| 概要 | {{ELEVATOR_PITCH}} |
| 技術スタック | {{TECH_STACK_SUMMARY}} |
| リポジトリ | {{REPO_URL}} |

---

## 最重要ルール

```
1. 仕様書がない機能は実装しない
2. 実装前に必ず該当の仕様書を読む
3. 仕様と実装の乖離を見つけたら報告する
4. コア定義（docs/design/core/）は原則変更不可
```

---

## 起動時アクション（SessionStart 自動実行）

```
Bot起動時に以下が自動実行される（SessionStart hook）:

1. framework-runner.sh が実行される
2. gh issue list --assignee @me --state open で未完了Issue取得
3. autonomy.json の issueLabels で自律レベル判定
4. 結果がコンテキストに注入される

起動後の行動:
  autonomous タスクあり → 即座に着手。SSOT確認 → ブランチ作成 → 実装 → PR → 報告
  notify タスクあり     → CTOに[提案]送信。5分待機後に着手
  approval タスクあり   → CTOに[承認依頼]送信。承認まで待機
  タスクなし            → アイドル。次の指示を待機

タスク完了時:
  gh issue close / gh pr create / gh pr merge 実行後、
  post-task.sh が自動実行され、次タスクを提案する。
```

---

## 🔒 Pre-Code Gate（CLI で構造的に強制）

```
コードを1行でも書く前に、3段階のGateを全て通過する必要がある。
Gate は 2層の構造的強制で実行される。

Layer 1: Claude Code hook（リアルタイム）
  - PreToolUse フックが Edit/Write をインターセプト
  - src/ 等のソースコードパスへの編集を Gate 未通過時にブロック
  - .claude/hooks/pre-code-gate.sh → ローカル hook 用キャッシュ .framework/gates.json を参照
  - docs/, config 等の非ソースファイルは制限なし

Layer 2: Git pre-commit hook（コミット時）
  - ソースファイルが含まれるコミットで `shirube gate check` をフル実行
  - 緊急時は `git commit --no-verify` でバイパス可能

Gate A: 開発環境・インフラの準備
  - package.json, node_modules, .env, docker-compose, CI/CD の存在確認

Gate B: タスク分解・計画の完了
  - .framework/plan.json（shirube plan 実行済み）
  - .framework/project.json の存在確認
  - docs_layers 有効時は 4-layer docs implementation readiness も確認

Gate C: SSOT 完全性チェック
  - core SSOT と feature SPEC/IMPL/VERIFY/OPS の完全性
  - placeholder-only spec と trace 不備を BLOCK

操作コマンド:
  shirube gate check       全Gate一括チェック → gates.json に保存
  shirube gate check-a     Gate A のみチェック
  shirube gate check-b     Gate B のみチェック
  shirube gate check-c     Gate C のみチェック
  shirube gate status      現在のGate状態を表示
  shirube gate spec        feature SPEC の実装可能性を検証
  shirube trace verify     SPEC/IMPL/VERIFY/OPS の trace を検証

自動連動:
  shirube update           → .framework/gates.json を最新ルールで再生成
  GitHub Actions check runs  → gate status の正

日常のワークフロー:
  1. shirube gate check   ← 全ゲートをチェック
  2. shirube gate status  ← 結果を確認
  3. 未通過のGateがあれば修正
  4. shirube run          ← 全Gate通過後のみ実行可能
```

---

## 会社ナレッジ参照ルール

> `.framework/project.json` に `knowledgeSource` が設定されている場合、
> `shirube sync-knowledge` で会社の知識データベースからダイジェストを生成できる。

```
参照ファイル: docs/knowledge/_company/KNOWLEDGE_DIGEST.md

このファイルが存在する場合、以下のルールを適用する:

1. 設計判断・機能提案の前に KNOWLEDGE_DIGEST.md を読み、記載された原則に従う
2. マーケティング関連の判断はダイジェストの原則を根拠にする
3. ダイジェストの原則と矛盾する実装を検出した場合は警告する
4. ダイジェストに記載のない領域の判断が必要な場合は報告する

ファイルが存在しない場合は、このセクションを無視してよい。

設定: .framework/project.json の knowledgeSource
更新: shirube sync-knowledge（または手動で配置）
```

---

## 仕様書の参照方法

### 実装前に必ず確認するドキュメント（優先順）

```
1. 機能仕様書         → docs/design/features/
2. コア定義           → docs/design/core/
   - UI/状態遷移      → docs/design/core/SSOT-2_UI_STATE.md
   - API規約          → docs/design/core/SSOT-3_API_CONTRACT.md
   - データモデル     → docs/design/core/SSOT-4_DATA_MODEL.md
   - 横断的関心事     → docs/design/core/SSOT-5_CROSS_CUTTING.md
3. 開発規約           → docs/standards/
   - コーディング規約 → docs/standards/CODING_STANDARDS.md
   - テスト規約       → docs/standards/TESTING_STANDARDS.md
   - Git運用          → docs/standards/GIT_WORKFLOW.md
   - 決済セキュリティ → docs/standards/SECURITY_STRIPE.md（Stripe利用時）
4. PRD               → docs/requirements/SSOT-0_PRD.md
```

### 機能を実装する時のフロー

```
1. 対象の機能仕様書を読む
   → docs/design/features/common/  （共通機能）
   → docs/design/features/project/ （固有機能）

2. 関連するコア定義を確認
   → API設計 → SSOT-3
   → DB設計 → SSOT-4
   → 認証/エラー/ログ → SSOT-5

3. 実装
   → コーディング規約に従う
   → テスト規約に従う

4. テスト
   → 仕様書のテストケースに基づく
```

---

## ディレクトリ構造

```
.claude/
└── agents/                   ← Agent Teams（CLI パターン）
    ├── visual-tester.md      ← ビジュアルテスト専門
    ├── code-reviewer.md      ← Adversarial Review Role B
    └── ssot-explorer.md      ← SSOT検索・要約

docs/                         ← 全仕様書（SSOT）
├── idea/                     ← アイデア・検証
├── requirements/             ← 要件定義
├── design/                   ← 設計
│   ├── core/                 ← コア定義（変更不可）
│   ├── features/             ← 機能仕様
│   │   ├── common/           ← 共通機能
│   │   └── project/          ← 固有機能
│   └── adr/                  ← 設計判断記録
├── standards/                ← 開発規約
├── operations/               ← 運用
├── marketing/                ← マーケティング
├── growth/                   ← グロース
└── management/               ← プロジェクト管理

src/                          ← ソースコード
├── app/                      ← ページ / ルーティング
├── components/               ← UIコンポーネント
│   ├── ui/                   ← 汎用UI
│   └── features/             ← 機能別コンポーネント
├── lib/                      ← ユーティリティ / 設定
├── hooks/                    ← カスタムフック
├── types/                    ← 型定義
├── services/                 ← 外部サービス連携
└── __tests__/                ← テスト

```

---

## 技術スタック

| カテゴリ | 技術 |
|---------|------|
| フレームワーク | {{FRAMEWORK}} |
| 言語 | {{LANGUAGE}} |
| DB | {{DATABASE}} |
| 認証 | {{AUTH}} |
| ホスティング | {{HOSTING}} |
| CSS | {{CSS}} |
| テスト | {{TESTING}} |
| CI/CD | {{CI_CD}} |

---

## コーディング規約（要約）

> 詳細: docs/standards/CODING_STANDARDS.md

### 命名規則
- コンポーネント: PascalCase（`LoginForm.tsx`）
- 関数/変数: camelCase（`handleSubmit`）
- 定数: UPPER_SNAKE_CASE（`MAX_RETRY_COUNT`）
- ファイル: kebab-case（`login-form.tsx`）※コンポーネント以外
- 型/Interface: PascalCase + 接尾辞（`UserResponse`, `AuthState`）

### 基本原則
- 1ファイル200行以内を目安
- 1関数1責務
- マジックナンバー禁止（定数化する）
- any 禁止（型を明示する）
- コメントは「なぜ」を書く（「何を」はコードで表現）

---

## Git 運用（要約）

> 詳細: docs/standards/GIT_WORKFLOW.md

### ブランチ戦略
```
main ← production
  └── develop ← 開発統合
        └── feature/XXX-description ← 機能開発
        └── fix/XXX-description ← バグ修正
        └── hotfix/XXX-description ← 緊急修正
```

### コミットメッセージ
```
<type>(<scope>): <description>

type: feat | fix | docs | style | refactor | test | chore
scope: 機能ID or モジュール名
```

---

## テスト規約（要約）

> 詳細: docs/standards/TESTING_STANDARDS.md

### テスト種類
- ユニットテスト: 全ビジネスロジック
- 統合テスト: API エンドポイント
- E2Eテスト: クリティカルパス

### カバレッジ目標
- ビジネスロジック: 80%+
- API: 70%+
- 全体: 60%+

---

## Workflow Orchestration

このプロジェクトには4つの専門スキルが .claude/skills/ に配置されている。
各スキルには専門エージェントが定義されており、品質の高い成果物を生成する。
詳細: .claude/skills/_INDEX.md

### スキル起動ルール

**明示的なフェーズ指示**（以下のキーワード）→ 即座に Skill ツールで対応スキルを起動:

| キーワード | 起動スキル |
|-----------|-----------|
| 「ディスカバリー」「何を作りたい？」「アイデア」 | /discovery |
| 「設計」「仕様を作って」「スペック」「アーキテクチャ」 | /design |
| 「実装開始」「コードを書いて」「タスク分解」 | /implement |
| 「レビュー」「監査」「audit」 | /review |
| 「設計ゲート」「design gate」「gate-design」 | /gate-design |
| 「品質ゲート」「quality gate」「gate-quality」 | /gate-quality |

**タスク指示**（「DEV-XXXを実装して」「〇〇機能を作って」等）→ 適切なスキルの起動を提案:
- 新機能の場合: 「/design で設計してから /implement で実装しますか？」
- 既存機能の修正: 「/implement で実装しますか？」
- 品質確認: 「/review で監査しますか？」
ユーザーが承認したら Skill ツールで起動。不要と判断されたらスキップ。

**軽微な作業**（typo修正、設定変更、1ファイルの小修正等）→ スキル不要。直接作業。

### Phase Authority

Producer phase と Gate / Review phase を明確に分ける。

| スキル | Authority | 自己チェック | PASS/BLOCK判定 | 停止条件 |
|--------|-----------|--------------|----------------|----------|
| /discovery | producer | yes | no | /design 前にユーザー確認 |
| /design | producer | yes | no | /gate-design または /implement 前にユーザー確認 |
| /implement | producer | yes | no | /gate-quality または /review 前にユーザー確認 |
| /gate-design | independent gate | n/a | yes | 判定を報告して停止 |
| /gate-quality | independent gate | n/a | yes | 判定を報告して停止 |
| /review | independent review | n/a | yes | 判定を報告して停止 |

### Development Principles

Shirube の開発判断は、直近の実用性と世界公開向け最終設計を同じ線上に置く。

- すぐ動く tactical slice は、public MCP-quality / world release に向かう最小の前進でなければならない。
- 後で捨てる前提の workaround は採用しない。暫定措置が必要な場合は scope、rollback、follow-up、証跡を明記する。
- flow、state transition、validation、delivery、retry、finalize、merge gate は script / CLI / CI / daemon / runner が制御する。
- ready / merge / status / design assertion は、実 file、コマンド出力、DB query、log、GitHub SSOT、公式 doc など再実行可能な証跡で判断する。
- memory、口頭報告、過去 status は context であり、claim する前に外部 SSOT で確認する。

### LLM Control Policy

Shirube の設計・実装では、LLMに進行制御を委ねず、deterministic control を基本とする。

- default: script / daemon / queue runner / CI / GitHub Actions / DB trigger / 明示CLI
- Hook fallback: `PreToolUse` block、`SessionStart` / `UserPromptSubmit` context injection、`SessionStart` state recovery、`PostToolUse` immediate verification、`Stop` completion-time verification のみ
- queue進行、状態遷移、retry、finalize、外部投稿は Runner / deterministic service が持つ
- LLM runtime adapter は runtime-specific invocation と structured result の返却だけを担当する
- 起動時注入は bounded restart pack に限定し、全文memory dumpをしない
- memory/context retrieval は provenance付きcontextとして扱い、secret / PII / local path をredactする

### Design Thinking Flow

`/design` で自動化、エージェント挙動、Hook、memory、queue、Issue/PR生成、runtime orchestration を扱う場合は、成果物作成前に以下を整理する。

1. Source of Truth: どのartifact/stateが正か
2. Control split: deterministic control と LLM judgment の分担
3. Hook justification: Hook採用時の不可避ケース該当根拠
4. Runtime boundary: Runner、LLM adapter、memory/context、delivery adapter の責務
5. Startup context: SessionStartで入れるrestart packとon-demand検索に残す情報
6. Mechanical gates: 実装前、完了前、CIでblockする条件
7. Authority: Gate、CTO/L3、CEO判断が必要な変更

### Framework Start Boundary

`shirube start [path] --feature <id>` が `.framework/current-session.json` を作成した時点を「フレームワーク主導開発の開始」とする。
`init`, `retrofit`, `update` は適用・更新であり、開発開始ではない。

既に `.framework/current-session.json` がある場合、`shirube start` は勝手に上書きしない。
既存セッションを続ける場合は `shirube start --resume`、新しい feature として切り直す場合は `shirube start --force --feature <id>` を使う。
`shirube exit` で framework mode を抜けた後も、適用済みプロジェクトであれば `shirube start --resume` で再開・再アクティベートできる。

開始後の最初の実作業は `/design <feature-id>` または、既に SPEC/IMPL/VERIFY/OPS が揃っている場合のみ `/implement <feature-id>` とする。
Gate / Review への遷移はユーザー承認後に行う。

### Command Lifecycle

| Command | Condition | Behavior | Result |
|---------|-----------|----------|--------|
| `shirube init <name>` | new project | create `.framework/`, docs, hooks, templates and activate framework mode | applied |
| `shirube retrofit [path] --generate` | existing repo adoption | analyze existing repo, install missing docs/hooks/templates and activate framework mode | applied |
| `shirube update [path]` | already applied repo | update docs/templates/hooks/GitHub templates and regenerate gates cache | applied |
| `shirube roles doctor` | after init/retrofit, before strict start | check missing or placeholder role bindings | role readiness checked |
| `shirube roles set <role> --type <type> --id <id>` | before strict start or when rotating owners | update role binding in `.framework/config.json` | roles configured |
| `shirube start [path] --feature <id>` | applied repo without active session | create `.framework/current-session.json` and activate framework mode | framework-led |
| `shirube start [path] --resume` | active session exists, or after `shirube exit` | load existing session and reactivate framework mode | framework-led |
| `shirube start [path] --force --feature <id>` | intentionally replacing current session | replace `.framework/current-session.json` | framework-led |
| `shirube gate check` | before implementation or after update | evaluate Gate A/B/C and regenerate local hook cache | gate status refreshed |
| `shirube trace verify` | checking 4-layer docs | verify SPEC/IMPL/VERIFY/OPS traceability | trace checked |
| `shirube exit --reason <reason>` | CEO-approved temporary exit | remove `framework-managed` topic and log audit event; session file remains | exited |

`framework` は後方互換 alias とする。新しい docs、公開例、MCP 利用ガイドでは `shirube` を primary command とする。

### Quality Modes And Audit Levels

Shirube の基本条件はフルオーケストラ運用とする。
通常開発では producer と gate/review を別エージェントまたは別ロールに分離する。

単一エージェント運用は、小変更、移行初期、dogfooding、外部エージェント未整備のリポジトリ向けの明示的な lightweight mode とする。
ただし品質担保は「同一エージェントの自己承認」ではなく、以下の構造で行う:

- Producer phase は証跡作成、テスト実行、自己チェック報告まで。
- Producer phase は PASS / BLOCK / ready to merge を確定してはいけない。
- Gate / Review phase を明示的に起動し、同じエージェントでも別フェーズ・別Authorityとして判定する。
- `.framework/current-session.json` の `qualityMode: "single-agent"` は、複数エージェント不在時の運用モードであり、Gate省略ではない。

`shirube start` のデフォルトは `qualityMode: "multi-agent"` とする。
`--audit-level strict` では `single-agent` を使ってはいけない。
`single-agent` を使う場合は `--quality-mode single-agent` を明示し、原則 `--audit-level minimal` の小変更に限定する。

`shirube start --audit-level <level>` で監査段数を選択する。

| auditLevel | 必須監査 | 用途 |
|------------|----------|------|
| minimal | L0 + L1 | 小変更、低リスク修正。CI と lead review は必須 |
| standard | L0 + L1 + L2 | 通常開発。独立 auditor の 6-axis review を必須 |
| strict | L0 + L1 + L2 + L3 | 仕様変更、framework変更、cross-cutting変更、merge判断を伴う変更 |

L4 は `route:ceo-approval`、戦略判断、critical PR の場合のみ追加する。

| Layer | Owner | Authority |
|-------|-------|-----------|
| L0 | CI / deterministic checks | typecheck, lint, test, breaking-change check で block |
| L1 | lead | scope, spec fit, PR description, Producer Self-check で block |
| L2 | auditor | design intent, hidden risk, regression, SSOT, honesty で block |
| L3 | technical governance owner / CTO | governance, cross-cutting architecture, framework integrity, merge authority で block |
| L4 | CEO / human approver | strategic approval で block |

`strict` は世界公開しても恥ずかしくない MCP 品質の基準とする。
そのため `strict` では `.framework/config.json` の `roles.bindings` に具体的な role binding が必要。
role が未設定または placeholder のままなら `shirube start` は BLOCK する。
producer と gate/review/L3 authority が同一 target、または同一 actor label の場合も `standard` / `strict` は BLOCK する。
`architecture_owner` は設計担当、`l3_governance_owner` は技術責任者 / L3 最終監査として分離する。
`standard` / `minimal` では warning として表示し、移行中・dogfooding 中の進行を許容する。

Producer は `shirube gate check` / `shirube trace verify` を実行し、結果を報告してよい。
ただし `approved`, `audit passed`, `ready to implement`, `ready to merge` などの承認表現を確定してはいけない。
PASS / BLOCK / CONDITIONAL PASS を出せるのは `/gate-design`, `/gate-quality`, `/review` のみ。

Producer の完了報告は次の形にする:

```markdown
## Producer Self-check
- Created / updated:
- Commands run:
- Missing / risks:
- Recommended next action:

Authority: producer only
Can self-check: yes
Can approve gate: no
Must stop before: /gate-design, /gate-quality, or /review
```

### フェーズ遷移
各スキル完了後、次のフェーズを提案する:
discovery → design → implement → review
ユーザー承認後に次スキルを Skill ツールで起動。

Gate / Review 系への遷移は必ずユーザー承認後に行う。Producer が自動で独立GateやReviewを開始してはいけない。

### Pre-Code Gate 連携
「実装開始」の場合:
1. Skill ツールで /implement を起動
2. /implement スキル内で `shirube gate check` と `shirube trace verify` を確認
3. 全Gate passed なら実装開始。未通過なら BLOCK 理由を報告。

---

## Agent Teams（CLI パターン）

> Claude Code CLI の Agent Teams でエージェントを活用し、コンテキストを節約する。
> 詳細: ai-dev-framework/09_TOOLCHAIN.md §8

### エージェント一覧

```
.claude/agents/
├── visual-tester.md     ← ビジュアルテスト専門（20_VISUAL_TEST.md §4）
├── code-reviewer.md     ← Adversarial Review Role B（17_CODE_AUDIT.md）
└── ssot-explorer.md     ← SSOT検索・要約
```

### 使い方

```bash
# ビジュアルテストを Agent Teams に委譲
"visual-tester エージェントで AUTH-001 のビジュアルテストを実行して"

# コードレビューを Agent Teams に委譲
"code-reviewer エージェントで実装したコードをレビューして"

# SSOT検索を Agent Teams に委譲
"ssot-explorer エージェントで AUTH-001 のAPI仕様を調べて"
```

### ルール

以下のタスクは Agent Teams に委譲してコンテキストを節約すること:

1. **ビジュアルテスト**: 実装完了後、visual-tester エージェントで画面テスト
2. **Adversarial Review**: 実装完了後、code-reviewer エージェントでコード監査
3. **SSOT検索**: 大量のドキュメントから必要な情報を抽出する時
4. **影響分析**: コード変更の影響範囲を調査する時

---

## フィードバック（フレームワーク改善提案）

開発中に発見した問題パターンやフレームワーク改善案を提案できる:

```bash
# 手動で提案作成
shirube feedback propose \
  --title "エラーパターンの検出ルール追加" \
  --problem "特定のTypeErrorが頻発" \
  --target "docs/knowledge/lessons-learned.md" \
  --diff "## Type Safety\n- 関数呼び出し前に型ガードを追加" \
  --impact "同種のTypeErrorを予防" \
  --category "coding-rule" \
  --source "{{PROJECT_NAME}}"

# 保留中の提案を確認
shirube feedback list

# 承認（diff適用 + ナレッジ記録）
shirube feedback approve <id>

# フレームワーク本体へPR作成
shirube feedback approve <id> --push-upstream
```

`shirube run` 失敗時や `shirube audit` 低スコア時に自動提案も生成される。

---

## 禁止事項

```
❌ 仕様書にない機能を勝手に実装しない
❌ コア定義を勝手に変更しない
❌ テストなしでPRを出さない
❌ any 型を使わない
❌ console.log をプロダクションコードに残さない
❌ 環境変数をハードコードしない
❌ エラーを握りつぶさない（必ずハンドリング）
```

---

## よくあるタスクのコマンド例

```bash
# 機能実装
claude "docs/design/features/common/AUTH-001_login.md の仕様に基づいて
       ログイン機能を実装して"

# テスト生成
claude "src/components/features/auth/ のテストを
       docs/standards/TESTING_STANDARDS.md に基づいて生成して"

# リファクタリング
claude "src/ 以下のエラーハンドリングを
       docs/design/core/SSOT-5_CROSS_CUTTING.md に準拠させて"

# 仕様書の更新
claude "docs/design/features/project/FEAT-003.md を
       新しい要件に基づいて更新して"

# デプロイ
claude "docs/operations/DEPLOYMENT.md に基づいて
       staging環境にデプロイして"
```

---

## Self-Improving Rules

このプロジェクトは開発知見を自動蓄積し、CLAUDE.mdを進化させる。

### 知見の蓄積
- Gate検出結果 → .learnings/LEARNINGS.md にGate実行後に記録
- 実装中の発見 → .learnings/LEARNINGS.md に手動記録
- レビューフィードバック → .learnings/LEARNINGS.md に記録

### ルール昇格
- 同一パターン3回出現 → CLAUDE.mdへの昇格候補
- /self-improve コマンドで昇格提案を生成
- CEOの承認後にCLAUDE.mdに反映

### 以下は自動蓄積されたルール（昇格済み）
<!-- promoted rules will be added here -->
