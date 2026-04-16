# セッション引き継ぎプロンプト（2026-04-13 → 次セッション）

## 前回セッションの成果

OSS公開の全体設計、競合分析、収益戦略、決定論的制御強化改修A-E、Bot指示ブロック作成を完了。

---

## 決定事項一覧

### 1. `framework run --auto` は入れない
- **理由**: Gate 1/2/3は品質検証できるが、「5タスクの設計思想が一貫しているか」は検証できない。自動で10タスク進めると設計がバラバラになるリスクがある
- **代替**: CTO bot + agent-com listener方式が上位体験。完了報告→次タスク投入のループはagent-comのlistenerが担当（決定論的な[報告]タグ検知→CTO botへpush注入）
- **将来**: haishin-puls-hubで50-100タスクの実績後に再検討

### 2. 有料プラン確定
| | Community (OSS) | Pro | Enterprise |
|---|---|---|---|
| 価格 | 無料 | **$49/dev/月** | **$149/dev/月** |
| CLI全機能 | ✅ 制限なし | ✅ | ✅ |
| Dashboard | — | ✅ | ✅ |
| Custom Validators | — | ✅ | ✅ |
| SSO/RBAC/コンプライアンス | — | — | ✅ |

- **課金モデル**: サブスクのみ（従量課金は見送り）
- **核心原則**: CLI機能制限なし。有料は「可視化・チーム管理・ガバナンス」
- **ARR目標**: Enterprise 10社で$504K → バイアウト$7.6M（15x）

### 3. ADFのポジショニング
- 「AI開発フレームワーク」ではなく「AI開発の方法論（Methodology）」
- フレームワーク自体は競合多数（MetaSwarm, Ruflo, CrewAI等）
- ADFの本当のユニーク価値は3つのみ:
  1. **SSOT drift検出** — 仕様と実装の乖離を検出（競合にない）
  2. **設計書間の矛盾検出（Gate 1）** — PRDとAPI Contractの不整合（競合にない）
  3. **裁判構造+偽テスト検出（Gate 3）** — メトリクスベースでは原理的に不可能（競合にない）
- セキュリティ・コード品質・テストカバレッジはSonarQube MCP/Snyk MCPで代替可能

### 4. 3プロダクト構想
```
agent-com (aun): 神経系（通信・制御）
agent-mem (wasurezu): 記憶（知識・経験蓄積）
xDF (ADF等): 筋肉（部署ごとの実行・品質保証）
```
- ADFを他部署に適用可能（マーケ、営業、経理）→ 部署運営オーケストレーション
- **各プロダクトが単体でも戦える品質とポジショニングが必要**
- 最終形は「AI組織OS」だが、Phase 1はADF単体のOSS公開

### 5. 決定論的制御強化改修A-E 完了

| 改修 | 内容 | テスト追加 |
|------|------|----------|
| A | Validator出力スキーマ検証+リトライ（2回失敗→CRITICAL） | +8 |
| B | 偽テスト機械検出（test-quality-checker.ts、framework check tests） | +15 |
| C | pre-commitフック（console.log、.skip/.only、秘密情報検出） | — |
| D | LLMプロバイダー抽象化（claude/codex、config.json切替） | +12 |
| E | Gate結果構造化出力（--output json、stderr/stdout分離） | +6 |

- ブランチ: `feature/oss-prep-v1`
- コミット: `84b212c`
- テスト: 1414→1458 passed (+44)、新規regression 0
- SSOT: gdrive specs v1.0.0をrclone catで参照（ローカル複製せず二重管理回避）
- 仕様追記提案: `docs/proposals/spec-addition-06-llm-provider.md` 生成済み

### 6. LLMプロバイダー対応
- Claude Code + Codex CLI の2プロバイダー対応
- `.framework/config.json` の `provider` セクションで切り替え
- `claude -p` のハードコードを `llm-provider.ts` に集約完了
- Gemini CLI対応はv1.1（インターフェース準備済み）

---

## OSS公開フロー（7ステップ）

指示ブロックは全て作成済み（`/mnt/user-data/outputs/`）。

```
✅ Step 0: 改修A-E（完了、PR起票待ち）
→ Step 1: 内部情報クリーンアップ（IYASAK@固有パス除去）
→ Step 2: README + LICENSE + CONTRIBUTING（$49/$149 Plans、Codex対応記載）
→ Step 3: サンプルプロジェクト（examples/demo-project/）
→ Step 4: GitHub Actions CI
→ Step 5: npmパッケージ準備
→ Step 6: セキュリティ監査（コードレビュー修正3件の確認含む）
→ Step 7: GitHub Public化 + LP + ウェイトリスト
```

Step 2-5は並列実行可能。

---

## 生成した成果物ファイル一覧

### Bot指示ブロック（全て /mnt/user-data/outputs/）
- `oss-improvements-final.md` — 改修A-E統合指示（✅ Botに送信済み・完了）
- `oss-step1-cleanup.md` — 内部情報クリーンアップ
- `oss-step2-readme-license.md` — README+LICENSE+CONTRIBUTING（$49/$149反映済み）
- `oss-step3-6-combined.md` — サンプル/CI/npm/セキュリティ監査

### 戦略ドキュメント
- `oss-launch-roadmap.md` — 7ステップ実行計画+有料プランタイムライン
- `adf-monetization-strategy.md` — ティア設計・価格・収益予測
- `adf-deterministic-control-plan.md` — 全10改修の詳細設計（A-EはOSS前、残りはv1.1以降）
- `adf-oss-ready-improvements.md` — OSS用5改修の選定理由

---

## 競合分析結果

### 開発フレームワーク
- MetaSwarm: 18エージェント、Claude/Codex/Gemini対応、品質ゲートあり
- Ruflo: 100+エージェント、6,000+コミット、学習ループ
- CrewAI: 45,900 GitHub Stars、AMP（有料管理プラットフォーム）
- LangChain/LangGraph: 97,000 Stars、LangSmith（$500/月チーム）で収益化

### 品質ゲートMCPサーバー
- SonarQube MCP: 公式、静的解析+品質ゲート
- AI Quality Gate MCP: ESLint 600+ルール
- Snyk MCP: 公式、SAST/SCA、11ツール
- Codacy MCP: 静的解析+品質ゲート

### ADFの差別化（競合にないもの）
1. SSOT drift検出
2. 設計書間の矛盾検出（Gate 1）
3. 裁判構造+偽テスト検出（Gate 3）
4. Freeze進行制御（F1-F4）
5. 機能単位必須ヒアリング（バッチ生成禁止）
6. AI中断プロトコル（T1-T7）
7. Decision Backlog
8. 100点品質スコアリング

---

## Google Drive上のSSOT仕様書

パス: `/開発/ADF/v1.0.0_2026-04-12/specs/`

| ファイル | サイズ | 内容 |
|---------|--------|------|
| 01_DISCOVERY_v1.0.0.md | 16KB | 5段階ヒアリングフロー |
| 02_GENERATION_CHAIN_v1.0.0.md | 21KB | Step 0-4フロー、Freeze 1-4、Gate条件 |
| 03_SSOT_FORMAT_v1.0.0.md | 15KB | 3層SSOT構造（CORE/CONTRACT/DETAIL） |
| 04_FEATURE_SPEC_v1.0.0.md | 12KB | 機能単位ヒアリングPhase 1-5 |
| 05_IMPLEMENTATION_v1.0.0.md | 16KB | タスク分解、Wave分類、ブランチ戦略、Gate D |
| 06_CODE_QUALITY_v1.0.0.md | 26KB | 100点スコアリング、テスト3層、CI、監査レポート |
| 07_AI_PROTOCOL_v1.0.0.md | 13KB | T1-T7中断トリガー、Decision Backlog、自己進化 |
| 08_MARKETING_v1.0.0.md | 10KB | PASONA構造、LP/マーケティング |

---

## PENDING: 次のアクション

1. **PR作成** — `feature/oss-prep-v1` のPR起票（Bot回答待ち: `gh pr create` 実行許可済み）
2. **コードレビュー修正3件** — `code-review-fixes.md` の送信・実行状況を確認
   - baseBranch シェルインジェクション
   - gate release --auto-fix 接続
   - revert の git clean -fd
3. **OSS公開 Step 1-7** — 指示ブロック作成済み、改修完了後に順次実行
4. **v1.1以降の改修** — SSOT機械可読化、Freeze決定論化、CLAUDE.md→ESLint変換、スキルチェックポイント、Gate 3起訴チェックリスト
5. **haishin-puls-hub 108 feature実装** — ADF品質ゲート付きで開発再開
6. **仕様書追記提案の承認** — `docs/proposals/spec-addition-06-llm-provider.md`（改修Dで生成）

---

## 重要ファイル・パス

```
ai-dev-framework:
  リポジトリ:    ~/Developer/ai-dev-framework
  ブランチ:     feature/oss-prep-v1（改修A-E完了）
  テスト:       1458件
  仕様書SSOT:   gdrive /開発/ADF/v1.0.0_2026-04-12/specs/ (8本)
  仕様追記提案: docs/proposals/spec-addition-06-llm-provider.md

haishin-puls-hub:
  リポジトリ:    ~/Developer/haishin-puls-hub
  進捗:         12/120 done（10%）、1407 tests

Bot:
  @iyasaka_airules_bot  → ai-dev-framework
  @iyasaka_haishin_bot  → haishin-puls-hub
```
