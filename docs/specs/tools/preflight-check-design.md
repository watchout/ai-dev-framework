# プリフライトチェック機構 — 設計

## 目的

実装者（人間/AI問わず）が必読資料を実際に読んだことを決定論的に検証する。
自己申告ではなく、ファイルへの物理的アクセスの証拨を出力する。

## 仕組み

1. タスクごとに「必読ファイル一覧」をJSONで定義（`.framework/required-reading.json`）
2. 実装者は作業前に `bash scripts/preflight-check.sh` を実行（v1.1で `framework preflight` にCLI化）
3. スクリプトが各ファイルに物理的にアクセスし検証結果を出力:
   - 行数、サイズ
   - 先頭行（ファイル識別）
   - 最終5行のMD5ハッシュ（最後まで読んだ証拨）
   - キーセクションの存在確認+行番号
4. レポートを `.framework/preflight/` に保存
5. 実装者はレポートを承認者(approver)に提示。承認後に作業開始

## 必読リストのフォーマット

```json
{
  "task": "タスク名",
  "files": [
    {
      "path": "src/cli/commands/gate.ts",
      "type": "local",
      "sections": ["check", "design", "quality"],
      "reason": "Gate A/B/CのCLIエントリポイント"
    },
    {
      "path": "remote:path/to/spec.md",
      "type": "remote",
      "command": "rclone cat",
      "sections": ["Gate A", "Layer 0"],
      "reason": "Gate AのSSOT定義"
    }
  ]
}
```

### typeフィールド
- `local`: ローカルファイル。`cat` で読む
- `remote`: 外部ストレージ。`command` フィールドで取得コマンドを指定（デフォルト: `rclone cat`）

## レポート出力

### テキスト出力（デフォルト）
`.framework/preflight/preflight-{日時}.md` にMarkdownレポート

### JSON出力（MCP/CI連携用）
`--output json` でstdoutにJSON出力:

```json
{
  "task": "タスク名",
  "timestamp": "2026-04-13T12:00:00Z",
  "files": [
    {
      "path": "src/cli/commands/gate.ts",
      "status": "PASS",
      "lines": 245,
      "bytes": 8192,
      "firstLine": "import { Command } from 'commander';",
      "lastHash": "a1b2c3d4e5f6...",
      "sections": {
        "check": { "found": true, "line": 42 },
        "design": { "found": true, "line": 78 }
      }
    }
  ],
  "summary": { "total": 6, "pass": 5, "fail": 1 }
}
```

## ADF CLI統合（v1.1）

```bash
framework preflight                         # .framework/required-reading.json を使用
framework preflight --output json           # JSON出力（MCP tool対応）
framework preflight --file custom.json      # カスタムファイル指定
```

## スクリプト本体

`tools/preflight-check.sh` を参照。
