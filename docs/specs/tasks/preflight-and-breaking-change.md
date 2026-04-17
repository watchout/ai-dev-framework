# 実装指示: プリフライトチェック + 破壊的変更検出

## 対象リポジトリ
`~/Developer/ai-dev-framework`

## 背景

問題1: Botが〈読みました」と言うが実際にファイルにアクセスしていない
→ 決定論的に「読んだ証拠」を出力するプリフライトチェック

問題2: PR #164で shared-client fallback を削除 → merge → 送信成功率85%→1%崩壊
→ 破壊的変更をdiffから機械検出し、検証なしのmergeをブロック

---

## Step 0: 設計書を読む

以下の4ファイルを全て読み終わるまで、ファイル作成・変更は一切しないこと。

```bash
rclone cat "IYASAKA:開発/ADF/v1.0.0_2026-04-12/tools/preflight-check-design.md"
rclone cat "IYASAKA:開発/ADF/v1.0.0_2026-04-12/tools/preflight-check.sh"
rclone cat "IYASAKA:開発/ADF/v1.0.0_2026-04-12/tools/breaking-change-detection.md"
rclone cat "IYASAKA:開発/ADF/v1.0.0_2026-04-12/tools/audit-depth-control-v3.md"
```

---

## Step 1: 既存コードの把握

```bash
ls scripts/ 2>/dev/null || echo "scripts/ does not exist"
ls .framework/ 2>/dev/null || echo ".framework/ does not exist"
ls .github/workflows/ 2>/dev/null
cat .husky/pre-commit 2>/dev/null
find ~ -name "governance-flow.md" -path "*/.claude/*" 2>/dev/null | head -5
cat ~/.claude/rules/governance-flow.md 2>/dev/null | head -50
cat .gitignore 2>/dev/null | tail -10
```

---

## Step 2: プリフライトチェック — 実装

### 2-1. `scripts/preflight-check.sh` 作成

Driveの `preflight-check.sh` を基に作成。品質改善:
- エラー発生時はエラー内容をレポートに記録（握りつぶさない）
- `type: remote` で `command` フィールドに任意の取得コマンドを指定可能
- `--output json` 対応（第2引数）
- テスト除外は `.test.` / `.spec.` / `__tests__` パターン

### 2-2. テンプレート配置

`templates/project/.framework/required-reading.json.example` 作成

### 2-3. `.gitignore` に `.framework/preflight/` 追加

### 2-4. 検証

```bash
# テスト用必読リスト
cat > .framework/required-reading.json << 'EOF'
{
  "task": "preflight self-test",
  "files": [
    { "path": "package.json", "type": "local", "sections": ["name", "version", "scripts"], "reason": "Project basic info" },
    { "path": "tsconfig.json", "type": "local", "sections": ["compilerOptions", "target"], "reason": "TypeScript config" },
    { "path": "nonexistent-file.md", "type": "local", "sections": [], "reason": "Should FAIL" }
  ]
}
EOF

# テキスト出力
bash scripts/preflight-check.sh
# 期待: package.json→PASS, tsconfig.json→PASS, nonexistent→FAIL

# JSON出力
bash scripts/preflight-check.sh .framework/required-reading.json json
# 期待: stdout JSON, summary.pass=2, summary.fail=1

# JSONパース確認
bash scripts/preflight-check.sh .framework/required-reading.json json | python3 -c "import json,sys; d=json.load(sys.stdin); print(f'pass={d[\"summary\"][\"pass\"]}, fail={d[\"summary\"][\"fail\"]}')"
# 期待: pass=2, fail=1

rm .framework/required-reading.json
```

---

## Step 3: 破壊的変更検出 — 実装

### 3-1. `scripts/detect-breaking-changes.sh` 作成

Driveの `breaking-change-detection.md` 記載のスクリプトを基に作成。品質改善:
- テスト除外を `grep -v "\.test\.\|\.spec\.\|__tests__"` に修正
- 終了コード: 0=検出なし、1=検出あり
- `--output json` 対応（第2引数）

### 3-2. `.github/workflows/breaking-change-check.yml` 作成

### 3-3. テンプレート配置

```bash
cp scripts/detect-breaking-changes.sh templates/project/scripts/
cp .github/workflows/breaking-change-check.yml templates/project/.github/workflows/
```

### 3-4. 検証

```bash
# 現在のブランチで実行
bash scripts/detect-breaking-changes.sh main
# 期待: 現在の差分に応じた結果

# JSON出力
bash scripts/detect-breaking-changes.sh main json
# 期待: JSON出力
```

---

## Step 4: governance-flow.md 更新

`~/.claude/rules/governance-flow.md` に追記。

追記内容（audit-depth-control-v3.md の Layer 0/1/2 定義を転記）:
- 4層chainとLayer 0/1/2は直交する概念と明記
- Layer 0で通過した項目はLayer 1/2で重複チェックしないと明記
- 破壊的変更のmerge前検証ルール
- 修正ループ制御（サイクル上限3）

### 検証

```bash
grep "Layer 0" ~/.claude/rules/governance-flow.md
grep "breaking-change-verified" ~/.claude/rules/governance-flow.md
grep "lead\|auditor\|chain" ~/.claude/rules/governance-flow.md | head -5
# 既存定義が壊れていないこと
```

---

## Step 5: 全体検証

```bash
# ファイル存在
ls scripts/preflight-check.sh scripts/detect-breaking-changes.sh .github/workflows/breaking-change-check.yml

# 実行権限
test -x scripts/preflight-check.sh && echo "OK" || echo "FAIL"
test -x scripts/detect-breaking-changes.sh && echo "OK" || echo "FAIL"

# .gitignore
grep "preflight" .gitignore

# 全テストパス
npm test

# CEOに報告
git diff --stat
git status --short | grep "^?"
```

---

## 完了条件

### プリフライトチェック
- [ ] `scripts/preflight-check.sh` 作成・実行可能
- [ ] local/remote 両type動作
- [ ] 存在しないファイルで FAIL + エラーメッセージ記録
- [ ] `--output json` でJSONパース可能な出力
- [ ] テンプレートに `required-reading.json.example`
- [ ] `.gitignore` に `.framework/preflight/`

### 破壊的変更検出
- [ ] `scripts/detect-breaking-changes.sh` 作成・実行可能
- [ ] 7パターン検出
- [ ] テスト除外が正確
- [ ] 終了コード: 0/1
- [ ] `--output json` 対応
- [ ] CIワークフロー配置
- [ ] テンプレートにスクリプト+ワークフロー配置

### governance-flow.md
- [ ] Layer 0/1/2 定義追記
- [ ] 既存4層chainと矛盾なし
- [ ] 破壊的変更ルール記載
- [ ] 修正ループ制御記載

### 全体
- [ ] 全テストパス
- [ ] git diff でCEOに報告

## やらないこと
- CLI化（v1.1）
- 他2 repoへの配置（別dispatch）
- CLAUDE.md更新（別タスク）
