# 破壊的変更検出 — 設計 + スクリプト

## 防ぐもの

PR #164の事故: shared-client fallback削除 → merge → 送信成功率85%→1%崩壊。
merge前に影響範囲を検証していなかった。

---

## スクリプト: scripts/detect-breaking-changes.sh

```bash
#!/bin/bash
set -e

BASE_BRANCH="${1:-main}"
DIFF=$(git diff "${BASE_BRANCH}"...HEAD 2>/dev/null || git diff "${BASE_BRANCH}"..HEAD)
FINDINGS=()

# 1. fallback/default/catchall の削除
if echo "$DIFF" | grep -E '^\-.*\b(fallback|default|catch|else)\b' | grep -v "test" | grep -qv "//"; then
  FINDINGS+=("fallback/default branch removed — verify all callers")
fi

# 2. 関数シグネチャの変更
if echo "$DIFF" | grep -E '^\-.*function\s+\w+\(' | grep -qv "test"; then
  FINDINGS+=("Function signature changed — verify all call sites")
fi

# 3. export の削除
if echo "$DIFF" | grep -E '^\-.*export\s+(function|const|class|interface|type)\s+' | grep -qv "test"; then
  FINDINGS+=("Exported symbol removed — verify all importers")
fi

# 4. 環境変数の削除
if echo "$DIFF" | grep -E '^\-.*process\.env\.\w+' | grep -qv "test"; then
  FINDINGS+=("Environment variable removed — verify all deployments")
fi

# 5. DBスキーマ DROP
if echo "$DIFF" | grep -qE '^\-.*DROP\s+(TABLE|COLUMN)|^\-.*ALTER\s+TABLE.*DROP'; then
  FINDINGS+=("DB schema DROP — verify migration safety + rollback plan")
fi

# 6. APIエンドポイント削除
if echo "$DIFF" | grep -E '^\-.*\.(get|post|put|patch|delete)\s*\(' | grep -qv "test"; then
  FINDINGS+=("API endpoint removed — verify all clients")
fi

# 7. 共有リソースの削除
if echo "$DIFF" | grep -E '^\-.*shared|^\-.*global|^\-.*singleton' | grep -qv "test"; then
  FINDINGS+=("Shared/global resource removed — verify all consumers")
fi

if [ ${#FINDINGS[@]} -eq 0 ]; then
  echo "✅ No breaking change patterns detected."
  exit 0
fi

echo ""
echo "🔴 Breaking change patterns detected:"
echo ""
for f in "${FINDINGS[@]}"; do
  echo "  - $f"
done
echo ""
echo "merge前に:"
echo "  1. 影響を受ける全コンシューマーを特定"
echo "  2. 各コンシューマーで動作確認"
echo "  3. 検証結果をPRコメントに記録"
echo "  4. 'breaking-change-verified' ラベル付与後にmerge"
exit 1
```

---

## CI workflow: .github/workflows/breaking-change-check.yml

```yaml
name: Breaking Change Check
on:
  pull_request:
    branches: [main]
jobs:
  detect:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - name: Detect breaking changes
        run: bash scripts/detect-breaking-changes.sh
```

検出時: `breaking-change-verified` ラベルなしでmerge不可。

---

## 配置対象

- agent-comms-mcp
- ai-dev-framework
- haishin-puls-hub
- 今後の全リポジトリ

---

## 監査深度の設計

audit-depth-control-v3.md を参照。Layer 0/1/2の定義はそちらが正。
