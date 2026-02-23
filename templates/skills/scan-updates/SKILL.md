---
name: scan-updates
description: |
  AI開発ツール・エコシステムの最新情報をWeb検索で収集し、ダイジェストを作成する。
  「最新情報」「scan-updates」「アップデート確認」「ツール動向」で実行。
---

# Scan Updates Skill — AI開発エコシステム最新情報収集

## 概要

Claude Code、MCP、AI開発自動化に関する最新のノウハウ・活用事例・新機能情報を
Web検索で網羅的に収集し、構造化されたダイジェストとしてユーザーに提示する。

**目的**: ユーザーが自分で情報収集する手間を省き、「選ぶだけ」にする。

## ワークフロー

```
S1: 情報収集（Web検索） → S2: 分類・構造化 → S3: ダイジェスト提示 → S4: ユーザー選択 → S5: 反映
```

---

## S1: 情報収集（Web検索）

以下のカテゴリごとに WebSearch を実行する。**必ず全カテゴリを検索すること。**

### カテゴリ A: Claude Code の活用法・新機能

```
検索クエリ例:
- "Claude Code tips tricks 2026"
- "Claude Code hooks custom workflow"
- "Claude Code skills best practices"
- "Claude Code slash commands advanced"
- "claude code 活用 tips"
- "Claude Code new features"
```

重点ポイント:
- hooks（PreToolUse, PostToolUse）の新しいパターン
- skills の活用事例
- Agent Teams の運用パターン
- コンテキスト管理のテクニック
- CLAUDE.md の書き方のベストプラクティス

### カテゴリ B: MCP サーバー・エコシステム

```
検索クエリ例:
- "MCP servers new 2026"
- "Model Context Protocol best servers"
- "awesome MCP servers list"
- "MCP server development tutorial"
- "mcp サーバー おすすめ"
```

重点ポイント:
- 新しい MCP サーバー（DB連携、API連携、ファイル操作等）
- MCP プロトコルの仕様変更
- 本番環境での MCP 活用事例
- カスタム MCP サーバーの開発パターン

### カテゴリ C: AI コーディング自動化

```
検索クエリ例:
- "AI coding automation workflow 2026"
- "Claude API agent SDK"
- "AI development framework patterns"
- "AI pair programming best practices"
- "AI開発 自動化 ワークフロー"
```

重点ポイント:
- AI エージェントの設計パターン
- 自動テスト生成の新手法
- コードレビュー自動化
- CI/CD と AI の統合
- マルチエージェント協調パターン

### カテゴリ D: サービス連携・インテグレーション

```
検索クエリ例:
- "Claude Code integrations services"
- "AI development tool integrations 2026"
- "Claude Code GitHub integration advanced"
- "Claude Code IDE integration"
- "AI開発ツール 連携"
```

重点ポイント:
- GitHub/GitLab との高度な連携
- Slack/Discord/Notion 等との連携
- CI/CD パイプラインとの統合
- データベース直接操作パターン
- デプロイ自動化

### カテゴリ E: Anthropic 公式アップデート

```
検索クエリ例:
- "Anthropic blog Claude update 2026"
- "Claude API new features 2026"
- "Anthropic developer documentation changes"
- "Claude model updates capabilities"
```

重点ポイント:
- 新モデル・機能リリース
- API の仕様変更
- 公式ドキュメントの更新
- 料金体系の変更
- SDK アップデート

---

## S2: 分類・構造化

収集した情報を以下のフォーマットで整理する:

```markdown
## AI開発エコシステム最新ダイジェスト（YYYY-MM-DD）

### A. Claude Code 活用法・新機能
| # | タイトル | 概要（1-2文） | ソース | 重要度 |
|---|---------|-------------|--------|--------|
| A1 | ... | ... | URL | 高/中/低 |

### B. MCP サーバー・エコシステム
| # | タイトル | 概要（1-2文） | ソース | 重要度 |
|---|---------|-------------|--------|--------|
| B1 | ... | ... | URL | 高/中/低 |

### C. AI コーディング自動化
...

### D. サービス連携・インテグレーション
...

### E. Anthropic 公式アップデート
...
```

### 重要度の判定基準

| 重要度 | 基準 |
|--------|------|
| **高** | フレームワークに直接影響する / 即座に活用可能 / 公式の重要アップデート |
| **中** | 参考になるパターン / 将来的に採用可能 |
| **低** | 知識として有用だが即座の行動は不要 |

---

## S3: ダイジェスト提示

整理した一覧をユーザーに提示する。この時点で:

1. **重要度「高」の項目は強調表示** する
2. 各項目に連番を振る（A1, A2, B1, B2...）
3. 前回の収集日がわかる場合は差分を明示する

提示後、ユーザーに以下を尋ねる:

```
気になる項目の番号を教えてください。
詳細を調査して、フレームワークへの反映方法を提案します。
（例: "A1, B3, E2 を詳しく"）
```

---

## S4: ユーザー選択と深掘り

ユーザーが選択した項目について:

1. **ソースURL を WebFetch で読み込む**（可能な場合）
2. **追加の Web検索** で詳細情報を補完
3. **フレームワークへの反映案** を具体的に提案:
   - どのファイルを変更するか
   - どう活用できるか
   - 実装の優先度と工数感

```markdown
## 詳細調査: [項目番号] [タイトル]

### 概要
（2-3文の要約）

### フレームワークへの反映案
- **変更対象**: templates/xxx, specs/xxx 等
- **活用方法**: 具体的な適用イメージ
- **優先度**: 高/中/低
- **工数**: 小(1h以内) / 中(数時間) / 大(1日以上)

### 参考ソース
- [タイトル](URL)
```

---

## S5: 反映

ユーザーが「反映して」と指示した項目について:

1. **KNOWLEDGE_DIGEST.md に記録** する（採用した情報の履歴）
2. 必要に応じて **フレームワークのコード/テンプレートを更新** する
3. 大きな変更の場合は **GitHub Issue を作成** する

### KNOWLEDGE_DIGEST.md への記録フォーマット

```markdown
## YYYY-MM-DD: [カテゴリ] [タイトル]
- **ソース**: URL
- **概要**: 1-2文の要約
- **反映内容**: 何をどう変更したか
- **影響範囲**: templates/ や specs/ 等
```

---

## 検索のコツ

- **英語と日本語の両方** で検索する（情報量が大きく異なる）
- **日付フィルタ** を意識する（直近3ヶ月の情報を優先）
- **公式ソース** を優先する（Anthropic blog, GitHub repos, npm registry）
- **実践的な記事** を優先する（概念論より具体的なコード例・設定例）
- 1カテゴリあたり **最低2-3件** は収集する

## 制約

- 収集した情報の正確性は保証されない（Web 検索結果に依存）
- 有料記事やログイン必須のコンテンツは取得できない場合がある
- 前回の収集結果との自動差分は取れない（手動で KNOWLEDGE_DIGEST.md と照合）
