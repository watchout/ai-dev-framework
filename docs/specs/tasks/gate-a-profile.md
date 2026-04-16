# Gate A プロジェクトプロファイル対応 — 実装指示（プリフライト付き）

## ⚠️ Step 0: プリフライトスクリプト配置

以下を実行:

```bash
# Driveからプリフライトスクリプトを取得
mkdir -p scripts
rclone cat "IYASAKA:開発/ADF/v1.0.0_2026-04-12/tools/preflight-check.sh" > scripts/preflight-check.sh
chmod +x scripts/preflight-check.sh
```

---

## ⚠️ Step 1: 必読リスト配置

以下のJSONを `.framework/required-reading.json` に保存:

```json
{
  "task": "Gate A プロジェクトプロファイル対応",
  "files": [
    {
      "path": "src/cli/commands/gate.ts",
      "type": "local",
      "sections": ["check", "design", "quality", "release"],
      "reason": "Gate A/B/C のCLIエントリポイント。checkサブコマンドの実装箇所を抚握する"
    },
    {
      "path": "src/cli/lib/gate-check-engine.ts",
      "type": "local",
      "sections": ["docker", "env", "migration", "PASS", "FAIL"],
      "reason": "Gate A のチェックロジック本体（ファイル名は異なる可能性あり。存在しない場合は gate.ts 内にインライン実装されている）"
    },
    {
      "path": ".framework/config.json",
      "type": "local",
      "sections": ["provider"],
      "reason": "既存の config.json 構造。profile フィールドの追加先"
    },
    {
      "path": "templates/project/.framework/config.json",
      "type": "local",
      "sections": ["provider"],
      "reason": "テンプレートの config.json。profile フィールドのデフォルト値設定先"
    },
    {
      "path": "IYASAKA:開発/ADF/v1.0.0_2026-04-12/specs/05_IMPLEMENTATION_v1.0.0.md",
      "type": "rclone",
      "sections": ["Gate A", "Layer 0", "docker-compose", "Dev Environment", "Verification"],
      "reason": "Gate A チェック項目の SSOT 定義。§3.5-A が正"
    },
    {
      "path": "IYASAKA:開発/ADF/v1.0.0_2026-04-12/specs/06_CODE_QUALITY_v1.0.0.md",
      "type": "rclone",
      "sections": ["CI", "Gate", "Stage 1", "合格条件"],
      "reason": "CI/Gate 統合基準。Gate A の位置づけを把握する"
    }
  ]
}
```

---

## ⚠️ Step 2: プリフライトチェック実行

```bash
bash scripts/preflight-check.sh
```

生成されたレポート（`.framework/preflight/preflight-*.md`）の **全文** をCEOに提示すること。

**レポートを提示するまで、Step 3以降に進むことを禁止する。**

---

## ⚠️ Step 3: CEO承認待ち

CEOが「着手OK」と返答してから Step 4 に進むこと。

---

## Step 4: 実装（CEO承認後）

### なぜやるか（データ）

agent-comms-mcp の PR #162 が Gate A の `docker-compose.yml` 要件で BLOCK されている。
MCPサーバープロジェクトにDockerインフラは不要。

### プロファイル定義

| プロファイル | docker-compose | DB migration | CI yml | .env.example |
|-------------|:-:|:-:|:-:|:-:|
| `app`（デフォルト） | 必須 | 必須 | 必須 | 必須 |
| `api` | 必須 | 必須 | 必須 | 必須 |
| `mcp-server` | スキップ | スキップ | 必須 | 必須 |
| `cli` | スキップ | スキップ | 必須 | スキップ |
| `library` | スキップ | スキップ | 必須 | スキップ |

### 実装内容

1. `src/cli/lib/project-profile.ts` 新規作成
2. Gate A チェックロジックをプロファイルで分岤
3. Gate A 出力にプロファイル名表示
4. `--profile` CLIオプション追加
5. テンプレート更新
6. テスト追加(11件以上)
7. 仕様書追記提案

---

## 完了条件
- [ ] プリフライトレポートをCEOに提示済み
- [ ] `project-profile.ts` 作成済み
- [ ] 4プロファイル定義済み
- [ ] Gate A がプロファイル分岐
- [ ] `profile` 未指定 ・= `app`（後方互換性）
- [ ] SKIP項目に理由表示
- [ ] テスト11件以上追加
- [ ] 仕殞書追記提案出力済み
- [ ] 全テストパス
- [ ] git diff でCEOに報告