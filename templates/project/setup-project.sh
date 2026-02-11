#!/bin/bash
# ============================================================
# setup-project.sh
# プロジェクト初期構築スクリプト
#
# 使い方:
#   chmod +x setup-project.sh
#   ./setup-project.sh [プロジェクト名]
#
# または Claude Code で:
#   claude "setup-project.sh を実行して、
#          プロジェクト名は my-saas-app で"
# ============================================================

set -e

PROJECT_NAME=${1:-"my-project"}

echo "🚀 プロジェクト「${PROJECT_NAME}」を初期構築します..."

# ============================================================
# 1. ディレクトリ構造の作成
# ============================================================

echo "📁 ディレクトリ構造を作成中..."

# docs/
mkdir -p "${PROJECT_NAME}/docs/idea"
mkdir -p "${PROJECT_NAME}/docs/requirements"
mkdir -p "${PROJECT_NAME}/docs/design/core"
mkdir -p "${PROJECT_NAME}/docs/design/features/common"
mkdir -p "${PROJECT_NAME}/docs/design/features/project"
mkdir -p "${PROJECT_NAME}/docs/design/adr"
mkdir -p "${PROJECT_NAME}/docs/standards"
mkdir -p "${PROJECT_NAME}/docs/operations"
mkdir -p "${PROJECT_NAME}/docs/marketing"
mkdir -p "${PROJECT_NAME}/docs/growth"
mkdir -p "${PROJECT_NAME}/docs/management"

# src/（Next.js想定、後で上書き可能）
mkdir -p "${PROJECT_NAME}/src/app"
mkdir -p "${PROJECT_NAME}/src/components/ui"
mkdir -p "${PROJECT_NAME}/src/components/features"
mkdir -p "${PROJECT_NAME}/src/lib"
mkdir -p "${PROJECT_NAME}/src/hooks"
mkdir -p "${PROJECT_NAME}/src/types"
mkdir -p "${PROJECT_NAME}/src/services"
mkdir -p "${PROJECT_NAME}/src/__tests__"

# その他
mkdir -p "${PROJECT_NAME}/public"

# Claude Code Agent Teams（CLI パターン）
mkdir -p "${PROJECT_NAME}/.claude/agents"

# Agent Skills（擬似マルチエージェント）
mkdir -p "${PROJECT_NAME}/.claude/skills"

echo "✅ ディレクトリ構造を作成しました"

# ============================================================
# 2. README.md の作成
# ============================================================

cat > "${PROJECT_NAME}/README.md" << 'EOF'
# {{PRODUCT_NAME}}

> {{ELEVATOR_PITCH}}

## セットアップ

```bash
npm install
npm run dev
```

## ドキュメント

すべての仕様書は `docs/` にあります。

| ディレクトリ | 内容 |
|-------------|------|
| `docs/idea/` | アイデア・検証 |
| `docs/requirements/` | 要件定義 |
| `docs/design/` | 設計（コア定義・機能仕様） |
| `docs/standards/` | 開発規約 |
| `docs/operations/` | 運用 |
| `docs/marketing/` | マーケティング |

## 開発

- **Claude Code CLI**: 対話型の実装・デバッグ
- **Claude Code Web**: 仕様確定済みタスクの非同期・並列実行

詳細: CLAUDE.md を参照
EOF

echo "✅ README.md を作成しました"

# ============================================================
# 3. docs/ にプレースホルダーを配置
# ============================================================

echo "📄 ドキュメントのプレースホルダーを配置中..."

# docs/idea/
for file in IDEA_CANVAS USER_PERSONA COMPETITOR_ANALYSIS VALUE_PROPOSITION; do
  touch "${PROJECT_NAME}/docs/idea/${file}.md"
done

# docs/requirements/
for file in SSOT-0_PRD SSOT-1_FEATURE_CATALOG; do
  touch "${PROJECT_NAME}/docs/requirements/${file}.md"
done

# docs/design/core/
for file in SSOT-2_UI_STATE SSOT-3_API_CONTRACT SSOT-4_DATA_MODEL SSOT-5_CROSS_CUTTING; do
  touch "${PROJECT_NAME}/docs/design/core/${file}.md"
done

# docs/design/adr/
touch "${PROJECT_NAME}/docs/design/adr/000_TEMPLATE.md"

# docs/standards/
for file in TECH_STACK CODING_STANDARDS GIT_WORKFLOW TESTING_STANDARDS DEV_ENVIRONMENT; do
  touch "${PROJECT_NAME}/docs/standards/${file}.md"
done

# docs/operations/
for file in ENVIRONMENTS DEPLOYMENT MONITORING INCIDENT_RESPONSE; do
  touch "${PROJECT_NAME}/docs/operations/${file}.md"
done

# docs/marketing/
for file in LP_SPEC SNS_STRATEGY EMAIL_SEQUENCE LAUNCH_PLAN PRICING_STRATEGY; do
  touch "${PROJECT_NAME}/docs/marketing/${file}.md"
done

# docs/growth/
for file in GROWTH_STRATEGY METRICS_DEFINITION; do
  touch "${PROJECT_NAME}/docs/growth/${file}.md"
done

# docs/management/
for file in PROJECT_PLAN RISKS CHANGES; do
  touch "${PROJECT_NAME}/docs/management/${file}.md"
done

echo "✅ ドキュメントのプレースホルダーを配置しました"

# ============================================================
# 4. Agent Teams テンプレートの配置
# ============================================================

echo "🤖 Agent Teams テンプレートを配置中..."

# フレームワークのテンプレートディレクトリを探す
FRAMEWORK_DIR=""
if [ -d "../ai-dev-framework/templates/project/agents" ]; then
  FRAMEWORK_DIR="../ai-dev-framework"
elif [ -n "$AI_DEV_FRAMEWORK_DIR" ] && [ -d "$AI_DEV_FRAMEWORK_DIR/templates/project/agents" ]; then
  FRAMEWORK_DIR="$AI_DEV_FRAMEWORK_DIR"
fi

if [ -n "$FRAMEWORK_DIR" ]; then
  for agent_file in "$FRAMEWORK_DIR/templates/project/agents/"*.md; do
    if [ -f "$agent_file" ]; then
      filename=$(basename "$agent_file")
      cp "$agent_file" "${PROJECT_NAME}/.claude/agents/${filename}"
      # プレースホルダーを置換
      if command -v sed &> /dev/null; then
        sed -i.bak "s/{{PROJECT_NAME}}/${PROJECT_NAME}/g" "${PROJECT_NAME}/.claude/agents/${filename}"
        sed -i.bak "s|{{DEV_SERVER_URL}}|http://localhost:3000|g" "${PROJECT_NAME}/.claude/agents/${filename}"
        rm -f "${PROJECT_NAME}/.claude/agents/${filename}.bak"
      fi
    fi
  done
  echo "✅ Agent Teams テンプレートを配置しました（$(ls "${PROJECT_NAME}/.claude/agents/"*.md 2>/dev/null | wc -l | tr -d ' ') エージェント）"
else
  # フレームワークが見つからない場合はプレースホルダーを作成
  cat > "${PROJECT_NAME}/.claude/agents/README.md" << 'AGENT_EOF'
# Agent Teams

このディレクトリに `.md` ファイルを配置すると、
Claude Code CLI の Agent Teams が自動的にエージェントとして認識します。

## 推奨エージェント

| ファイル | 役割 |
|---------|------|
| visual-tester.md | ビジュアルテスト専門 |
| code-reviewer.md | Adversarial Review Role B |
| ssot-explorer.md | SSOT検索・要約 |

テンプレート: ai-dev-framework/templates/project/agents/
参照: ai-dev-framework/09_TOOLCHAIN.md §8, 20_VISUAL_TEST.md §4
AGENT_EOF
  echo "⚠️  Agent Teams テンプレートが見つかりません。README.md を配置しました"
fi

# ============================================================
# 5. Agent Skills テンプレートの配置
# ============================================================

echo "🧠 Agent Skills テンプレートを配置中..."

SKILLS_DIR=""
if [ -d "../ai-dev-framework/templates/skills" ]; then
  SKILLS_DIR="../ai-dev-framework/templates/skills"
elif [ -n "$AI_DEV_FRAMEWORK_DIR" ] && [ -d "$AI_DEV_FRAMEWORK_DIR/templates/skills" ]; then
  SKILLS_DIR="$AI_DEV_FRAMEWORK_DIR/templates/skills"
fi

if [ -n "$SKILLS_DIR" ]; then
  # 各 Skill フォルダをコピー
  for skill_dir in "$SKILLS_DIR"/*/; do
    if [ -d "$skill_dir" ]; then
      skill_name=$(basename "$skill_dir")
      mkdir -p "${PROJECT_NAME}/.claude/skills/${skill_name}"
      cp -r "$skill_dir"* "${PROJECT_NAME}/.claude/skills/${skill_name}/"
    fi
  done
  # Deliberation Protocol もコピー
  if [ -d "$SKILLS_DIR/_deliberation" ]; then
    mkdir -p "${PROJECT_NAME}/.claude/skills/_deliberation"
    cp -r "$SKILLS_DIR/_deliberation/"* "${PROJECT_NAME}/.claude/skills/_deliberation/"
  fi
  # INDEX もコピー
  if [ -f "$SKILLS_DIR/SKILLS_INDEX.md" ]; then
    cp "$SKILLS_DIR/SKILLS_INDEX.md" "${PROJECT_NAME}/.claude/skills/"
  fi
  skill_count=$(find "${PROJECT_NAME}/.claude/skills" -name "SKILL.md" | wc -l | tr -d ' ')
  echo "✅ Agent Skills テンプレートを配置しました（${skill_count} Skills）"
else
  cat > "${PROJECT_NAME}/.claude/skills/README.md" << 'SKILLS_EOF'
# Agent Skills

このディレクトリに Skill フォルダ（SKILL.md を含む）を配置すると、
Claude Code が自動的に検出して使用します。

## 推奨 Skills

| Skill | 役割 |
|-------|------|
| framework-orchestrator | 全体ナビゲーター |
| framework-discovery | ディスカバリー専門家 |
| framework-business | 事業設計専門家 |
| framework-product | PRD・機能カタログ |
| framework-feature-spec | 機能仕様設計専門家 |
| framework-technical | テクニカルアーキテクト |
| framework-implement | 実装者（Role A） |
| framework-code-audit | Adversarial Review（Role B） |
| framework-ssot-audit | SSOT 品質監査 |
| framework-review-council | 多視点レビュー会議 |

テンプレート: ai-dev-framework/templates/skills/
SKILLS_EOF
  echo "⚠️  Agent Skills テンプレートが見つかりません。README.md を配置しました"
fi

# ============================================================
# 6. docs/INDEX.md の作成
# ============================================================

cat > "${PROJECT_NAME}/docs/INDEX.md" << 'EOF'
# ドキュメントインデックス

## 仕様書一覧

### アイデア・検証（docs/idea/）
| ドキュメント | 状態 | 説明 |
|-------------|------|------|
| IDEA_CANVAS.md | ☐ 未作成 | アイデアキャンバス |
| USER_PERSONA.md | ☐ 未作成 | ユーザーペルソナ |
| COMPETITOR_ANALYSIS.md | ☐ 未作成 | 競合分析 |
| VALUE_PROPOSITION.md | ☐ 未作成 | 価値提案キャンバス |

### 要件定義（docs/requirements/）
| ドキュメント | 状態 | 説明 |
|-------------|------|------|
| SSOT-0_PRD.md | ☐ 未作成 | プロダクト要件定義書 |
| SSOT-1_FEATURE_CATALOG.md | ☐ 未作成 | 機能カタログ |

### 設計（docs/design/）
| ドキュメント | 状態 | 説明 |
|-------------|------|------|
| core/SSOT-2_UI_STATE.md | ☐ 未作成 | UI/状態遷移定義 |
| core/SSOT-3_API_CONTRACT.md | ☐ 未作成 | API規約 |
| core/SSOT-4_DATA_MODEL.md | ☐ 未作成 | データモデル |
| core/SSOT-5_CROSS_CUTTING.md | ☐ 未作成 | 横断的関心事 |

### 開発規約（docs/standards/）
| ドキュメント | 状態 | 説明 |
|-------------|------|------|
| TECH_STACK.md | ☐ 未作成 | 技術スタック定義 |
| CODING_STANDARDS.md | ☐ 未作成 | コーディング規約 |
| GIT_WORKFLOW.md | ☐ 未作成 | Git運用規約 |
| TESTING_STANDARDS.md | ☐ 未作成 | テスト規約 |

### 運用（docs/operations/）
| ドキュメント | 状態 | 説明 |
|-------------|------|------|
| ENVIRONMENTS.md | ☐ 未作成 | 環境構成定義 |
| DEPLOYMENT.md | ☐ 未作成 | デプロイ手順 |
| MONITORING.md | ☐ 未作成 | 監視・アラート定義 |
| INCIDENT_RESPONSE.md | ☐ 未作成 | 障害対応手順 |

### マーケティング（docs/marketing/）
| ドキュメント | 状態 | 説明 |
|-------------|------|------|
| LP_SPEC.md | ☐ 未作成 | LP設計書 |
| SNS_STRATEGY.md | ☐ 未作成 | SNS運用戦略 |
| EMAIL_SEQUENCE.md | ☐ 未作成 | メールシーケンス |
| LAUNCH_PLAN.md | ☐ 未作成 | ローンチ計画 |
| PRICING_STRATEGY.md | ☐ 未作成 | 価格戦略 |

### グロース（docs/growth/）
| ドキュメント | 状態 | 説明 |
|-------------|------|------|
| GROWTH_STRATEGY.md | ☐ 未作成 | グロース戦略 |
| METRICS_DEFINITION.md | ☐ 未作成 | KPI定義 |

### プロジェクト管理（docs/management/）
| ドキュメント | 状態 | 説明 |
|-------------|------|------|
| PROJECT_PLAN.md | ☐ 未作成 | プロジェクト計画 |
| RISKS.md | ☐ 未作成 | リスク管理 |
| CHANGES.md | ☐ 未作成 | 変更管理 |
EOF

echo "✅ docs/INDEX.md を作成しました"

# ============================================================
# 6. 完了メッセージ
# ============================================================

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo " ✅ プロジェクト「${PROJECT_NAME}」の初期構築が完了しました"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo " 📁 構造:"
echo "   ${PROJECT_NAME}/"
echo "   ├── CLAUDE.md          ← Claude Code 指示書（要設定）"
echo "   ├── .claude/skills/    ← Agent Skills（擬似マルチエージェント）"
echo "   ├── .claude/agents/    ← Agent Teams（CLIパターン）"
echo "   ├── docs/              ← 仕様書（プレースホルダー配置済み）"
echo "   │   └── INDEX.md      ← 仕様書一覧"
echo "   ├── src/               ← ソースコード"
echo "   └── README.md"
echo ""
echo " 🎯 次のステップ:"
echo "   1. CLAUDE.md の {{}} 部分を埋める"
echo "   2. docs/ のプレースホルダーにテンプレートの内容をコピー"
echo "   3. Claude.ai でディスカバリーフローを実行"
echo "   4. 結果を docs/idea/ に反映"
echo ""
echo " 💡 Claude Code で一括設定:"
echo "   cd ${PROJECT_NAME}"
echo "   claude \"CLAUDE.md の {{}} を"
echo "          以下の情報で埋めて: プロダクト名は○○、技術は...\" "
echo ""
