# スキルインストールガイド

> 既存プロジェクトへのスキルシステム適用方法

## クイックスタート

### 全スキルを一括インストール

```bash
# フレームワークディレクトリから実行
./bin/framework-skills-install.sh -a /path/to/your-project

# または環境変数で指定
FRAMEWORK_ROOT=/path/to/ai-dev-framework \
  ./bin/framework-skills-install.sh -a /path/to/your-project
```

### インストール結果

```
your-project/
└── .claude/
    └── skills/
        ├── _INDEX.md
        ├── agent-teams/
        ├── deliberation/
        ├── discovery/
        ├── business/
        ├── product/
        ├── technical/
        ├── implementation/
        └── review-council/
```

## 選択的インストール

### 特定フェーズのみ

```bash
# Discoveryとproductのみ
./bin/framework-skills-install.sh -p discovery -p product /path/to/project

# 実装フェーズのみ
./bin/framework-skills-install.sh -p implementation /path/to/project
```

### Agent Teamsと合議制のみ

```bash
./bin/framework-skills-install.sh -t -d /path/to/project
```

### 使用可能なオプション

| オプション | 説明 |
|-----------|------|
| `-a, --all` | 全スキルをインストール |
| `-p, --phase <name>` | 特定フェーズのみ |
| `-t, --teams` | Agent Teamsパターンのみ |
| `-d, --deliberation` | 合議制プロトコルのみ |
| `-u, --update` | 既存スキルを上書き更新 |
| `-n, --dry-run` | 実行せずに確認のみ |

### 利用可能なフェーズ名

- `discovery`
- `business`
- `product`
- `technical`
- `implementation`
- `review-council`

## 更新方法

フレームワークのスキルが更新された場合:

```bash
# 上書き更新
./bin/framework-skills-install.sh -a -u /path/to/project
```

## 手動インストール

スクリプトを使わずに手動でコピーする場合:

```bash
# ディレクトリ作成
mkdir -p /path/to/project/.claude/skills

# 必要なスキルをコピー
cp -r /path/to/ai-dev-framework/.claude/skills/deliberation \
      /path/to/project/.claude/skills/

cp -r /path/to/ai-dev-framework/.claude/skills/discovery \
      /path/to/project/.claude/skills/

# INDEXをコピー
cp /path/to/ai-dev-framework/.claude/skills/_INDEX.md \
   /path/to/project/.claude/skills/
```

## 複数プロジェクトへの一括適用

```bash
#!/bin/bash
# batch-install.sh

FRAMEWORK_ROOT=/path/to/ai-dev-framework
PROJECTS=(
  "/path/to/project-a"
  "/path/to/project-b"
  "/path/to/project-c"
)

for project in "${PROJECTS[@]}"; do
  echo "Installing skills to: $project"
  $FRAMEWORK_ROOT/bin/framework-skills-install.sh -a "$project"
done
```

## インストール後の確認

### スキル一覧の確認

```bash
cat .claude/skills/_INDEX.md
```

### 動作確認

Claude Codeで以下を実行:

```
「ディスカバリーを開始して」
「D1を実行」
「合議して：[議題]」
```

## トラブルシューティング

### スキルが認識されない

1. `.claude/skills/` ディレクトリの存在を確認
2. 各スキルに `SKILL.md` が存在するか確認
3. Claude Codeを再起動

### 権限エラー

```bash
# スクリプトに実行権限を付与
chmod +x bin/framework-skills-install.sh
```

### パスの問題

```bash
# 絶対パスで指定
FRAMEWORK_ROOT=/absolute/path/to/ai-dev-framework \
  ./bin/framework-skills-install.sh -a /absolute/path/to/project
```

## 知識データの適用

スキルと合わせて知識データベースも適用する場合:

```bash
# 知識データをコピー
cp -r /path/to/ai-dev-framework/docs/knowledge \
      /path/to/project/docs/
```

これにより、CES 2026分析などのトレンド情報がDiscoveryフェーズで参照可能になります。
