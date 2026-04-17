# 実装指示: Gate 2 プリフライト強制統合

## 背景

ADFのコア価値は「LLM逸脱防止の決定論的制御」。
現状、以下の穴がある:

```
プリフライトチェック:
  スクリプト（scripts/preflight-check.sh）があるだけ。
  実行しなくてもGate 2を通過できる。
  → Botが「読みました」と嘘をついて通過できる状態。
  → フレームワークの強制力がない = 提供価値がない。
```

Gate 2の冒頭で `.framework/preflight/` にレポートが存在するかチェックし、
未実行ならBLOCKする。CLI化・MCP化不要。数行のTypeScript。

## 設計書を読む

```bash
rclone cat "IYASAKA:開発/ADF/v1.0.0_2026-04-12/tools/preflight-check-design.md"
rclone cat "IYASAKA:開発/ADF/v1.0.0_2026-04-12/tools/audit-depth-control-v3.md"
```

## Step 1: 既存コード把握

```bash
# Gate 2 のエントリポイント
grep -n "runQualitySweep\|gate.*quality\|gate-quality" src/cli/commands/gate.ts | head -10

# Gate 2 エンジンの構造
head -50 src/cli/gates/gate-quality-engine.ts 2>/dev/null || \
find src -name "*quality*" -o -name "*gate-2*" | head -5

# .framework/ の既存構造
ls .framework/ 2>/dev/null

# required-reading.json のテンプレート
cat templates/project/.framework/required-reading.json.example
```

## Step 2: Gate 2にプリフライトチェックを統合

Gate 2（runQualitySweep）の冒頭に以下のロジックを追加:

```
1. .framework/required-reading.json が存在するか確認
   → 存在しない場合: プリフライト不要（required-reading未定義のプロジェクト）→ PASS
   → 存在する場合: Step 2に進む

2. .framework/preflight/ ディレクトリにレポートが存在するか確認
   → レポートがない場合: BLOCK
     reason: "Preflight check not executed. Run: bash scripts/preflight-check.sh"
   → レポートがある場合: Step 3に進む

3. 最新のレポートを読み込み、summaryを確認
   → summary.fail > 0 の場合: BLOCK
     reason: "Preflight check has failures. Fix and re-run."
   → summary.fail == 0 の場合: PASS
```

ポイント:
- `required-reading.json` が存在しないプロジェクトはスキップ（OSSユーザーに強制しない）
- `required-reading.json` が存在するプロジェクトはレポート必須（定義したら強制）
- レポートのJSONを読んで `summary.fail` を確認（テキストレポートではなくJSON）
- プリフライトはGate 2の最初のチェック。他の品質チェックより先に実行

## Step 3: テスト

```bash
# テスト1: required-reading.json がない場合 → プリフライトスキップ
rm -f .framework/required-reading.json
# Gate 2実行 → プリフライト関連でBLOCKされないこと

# テスト2: required-reading.json あり + レポートなし → BLOCK
cat > .framework/required-reading.json << 'EOF'
{
  "task": "test",
  "files": [
    { "path": "package.json", "type": "local", "sections": ["name"], "reason": "test" }
  ]
}
EOF
rm -rf .framework/preflight/
# Gate 2実行 → "Preflight check not executed" でBLOCK

# テスト3: required-reading.json あり + レポートあり(PASS) → 通過
bash scripts/preflight-check.sh .framework/required-reading.json json > /tmp/preflight-result.json
mkdir -p .framework/preflight
cp /tmp/preflight-result.json .framework/preflight/preflight-test.json
# Gate 2実行 → プリフライト通過

# テスツ4: required-reading.json あり + レポートあり(FAIL含む) → BLOCK
cat > .framework/required-reading.json << 'EOF'
{
  "task": "test-fail",
  "files": [
    { "path": "nonexistent.md", "type": "local", "sections": [], "reason": "should fail" }
  ]
}
EOF
bash scripts/preflight-check.sh .framework/required-reading.json json > .framework/preflight/preflight-test.json
# Gate 2実行 → "Preflight check has failures" でBLOCK

# 後片付け
rm -f .framework/required-reading.json
rm -rf .framework/preflight/
```

## Step 4: ユニットテスト追加

プリフライトGate統合のテストを追加:
- required-reading.json未定義 → スキップ（PASS）
- required-reading.json定義 + レポートなし → BLOCK
- required-reading.json定義 + レポートあり(全PASS) → PASS
- required-reading.json定義 + レポートあり(FAILあり) → BLOCK

## Step 5: 全体検証

```bash
npm test
git diff --stat
```

## 完了条件

- [ ] Gate 2冒頭でプリフライトチェック統合
- [ ] required-reading.json未定義のプロジェクトはスキップ
- [ ] required-reading.json定義済み + レポートなし → BLOCK
- [ ] required-reading.json定義済み + レポートあり(全PASS) → 通過
- [ ] required-reading.json定義済み + レポートあり(FAILあり) → BLOCK
- [ ] ユニットテスト4ケース追加
- [ ] 既存テスト全PASS
- [ ] git diff でCEOに報告

## やらないこと
- CLI化（framework preflight）→ v1.1
- MCP化 → v1.2
- Layer 1の6項目チェックのコード強制 → v1.1
