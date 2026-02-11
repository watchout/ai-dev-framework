# Company Knowledge Digest（会社ナレッジダイジェスト）

> プロジェクト横断で適用される会社レベルの知識（戦略・マーケティング・トレンド等）を
> 各プロジェクトの開発AIが参照できる形で配置するディレクトリ。

---

## 3層ナレッジアーキテクチャ

本フレームワークは知識を3層で管理する。このディレクトリは Layer 1 に該当する。

```
Layer 0: フレームワーク知識（汎用）
  場所: docs/standards/docs/marketing/, docs/standards/docs/knowledge/
  内容: PASONA, DRM等の汎用マーケティング理論 + プロジェクト知識テンプレート
  配信: framework update
  変更: フレームワーク開発者のみ

Layer 1: 会社知識（会社固有・プロジェクト横断）  ← ★ このディレクトリ
  場所: docs/knowledge/_company/KNOWLEDGE_DIGEST.md
  内容: 会社の戦略方針、トレンド分析、専門家の教え、経営判断の根拠
  配信: framework sync-knowledge（原本から生成）
  変更: 経営層 / CoS が原本を更新 → sync でプロジェクトに反映

Layer 2: プロジェクト知識（プロジェクト固有）
  場所: docs/knowledge/domain/, market/, users/
  内容: 競合分析、ペルソナ、ドメイン用語（そのプロダクト固有）
  配信: なし（プロジェクト内で完結）
  変更: プロジェクトチーム
```

## ファイル構成

```
docs/knowledge/_company/
├── README.md                  ← このファイル（フレームワークから配布）
└── KNOWLEDGE_DIGEST.md        ← 会社ナレッジのダイジェスト（sync-knowledge で生成）
```

- `README.md` は `framework update` で配布される（フレームワーク側で管理）
- `KNOWLEDGE_DIGEST.md` は会社の知識DBから生成される（プロジェクト側で管理）

## 設定

`.framework/project.json` に知識DBのソースを指定する:

```json
{
  "knowledgeSource": {
    "type": "local",
    "path": "/path/to/company/knowledge-database"
  }
}
```

| type | 説明 | 例 |
|------|------|---|
| `local` | ローカルファイルシステム上のパス | Google Drive, ローカルディレクトリ |
| `git` | Gitリポジトリ（将来対応） | GitHub上の知識リポジトリ |

## データフロー

```
会社の知識DB（SSOT・原本）
  例: Google Drive, Git repo, Notion等
  ↓
  ↓  framework sync-knowledge
  ↓  （原本を読み込み → このプロジェクトへの適用を生成）
  ↓
プロジェクト: docs/knowledge/_company/KNOWLEDGE_DIGEST.md
  ↓
  ↓  git commit & push
  ↓
VPS / CI / どこからでも参照可能
```

**ポイント:**
- 原本は会社の知識DBにのみ存在する（一元管理）
- プロジェクトにはダイジェスト（要約 + このプロジェクトへの適用）のみ配置
- ダイジェストを git commit することで、VPS等からも参照可能になる

## 更新方法

### Level A: 手動（現在の推奨）

```
1. 会社の知識DBに新しい知識を追加（原本を更新）
2. CoS（経営参謀）が月次チェックで変更を検知
3. 各プロジェクト用の KNOWLEDGE_DIGEST.md を手動生成
4. git commit & push でプロジェクトに反映
```

### Level B: CLI半自動（将来対応）

```bash
# knowledgeSource から知識DBを読み込み、ダイジェストを自動生成
framework sync-knowledge

# 特定プロジェクト向けにカスタマイズされたダイジェストを生成
framework sync-knowledge --project hotel-kanri
```

## KNOWLEDGE_DIGEST.md の推奨構造

```markdown
# Company Knowledge Digest — {プロジェクト名}

Generated: YYYY-MM-DD
Source: {知識DB名} {件数}件
Project: {プロジェクト名}
Next Update: YYYY-MM-DD（月次）

## Core Principles（全プロジェクト共通の原則）
- 会社全体に適用される経営・マーケティング原則

## This Project's Application（このプロジェクトへの適用）
- 上記原則をこのプロジェクトに具体的にどう適用するか

## Marketing Checklist
- マーケティング施策の実行チェックリスト

## PDCA Metrics
- KGI / KDI の定義

## Knowledge Index（詳細参照先）
- 原本の知識ファイル一覧と各ファイルのキーインサイト
```

## AI向け参照ルール

```
1. 設計判断・機能提案の前に KNOWLEDGE_DIGEST.md を読み、記載された原則に従う
2. マーケティング関連の判断はダイジェストの原則を根拠にする
3. ダイジェストの原則と矛盾する実装を検出した場合は警告する
4. ダイジェストに記載のない領域の判断が必要な場合は報告する
5. ダイジェストが存在しない場合は、このセクションを無視してよい
```
