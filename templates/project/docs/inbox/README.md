# docs/inbox/ — Design Ingest Pipeline

設計書をこのディレクトリに配置すると、`framework ingest` コマンドで自動的にSSOT化できます。

## 対応フォーマット

| 形式 | 拡張子 | 備考 |
|------|--------|------|
| Markdown | `.md` | そのまま読み込み |
| Word | `.docx` | pandoc で変換（要インストール: `brew install pandoc`） |

## 使い方

```bash
# 1. 設計書を配置
cp ~/Downloads/設計書.md docs/inbox/

# 2. 取り込み実行（プレビュー）
framework ingest --dry-run

# 3. 取り込み実行
framework ingest

# 4. 生成されたSSOTを確認・修正
# docs/design/features/ に出力される

# 5. 承認 → plan.json + GitHub Issues に統合
framework ingest --approve

# 6. GitHub Issues 同期
framework plan --sync
```

## ステータス確認

```bash
framework ingest --status
```

## 注意事項

- 取り込み後のファイルはこのディレクトリに残ります（削除不要）
- 同じファイルを再度取り込むとスキップされます
- 生成されたSSOTのSS3-E/F/G/H（例示・境界値・例外・受入テスト）は手動追加が必要です
