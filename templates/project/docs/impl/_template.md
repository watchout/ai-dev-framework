---
id: IMPL-{FEATURE}-{NNN}
status: Draft
traces:
  spec: [SPEC-{FEATURE}-001]
  verify: []
  ops: []
---

# IMPL: {feature-name}

## 0. 対応するSPEC [必須]

## 1. 配置図 [必須]
### 1.1 新規ファイル
### 1.2 変更ファイル
### 1.3 削除ファイル [該当時]

## 2. 型定義 [必須]
### 2.1 データ型（TypeScript / OpenAPI 抜粋）
### 2.2 関数シグネチャ
### 2.3 API契約（該当時、OpenAPI フラグメント）

## 3. シーケンス [必須]
### 3.1 正常系フロー（Mermaid sequenceDiagram）
### 3.2 トランザクション境界
### 3.3 並行性 [該当時]
### 3.4 Data Authority / Normalization 実装 [DB/state該当時]

> 対応: SPEC §5.4 / `docs/standards/DATA_AUTHORITY_NORMALIZATION.md`

| Mutable fact | Canonical write path | Read resolver / reference path | DB constraint / migration | Projection invalidation |
|---|---|---|---|---|
|  |  |  |  |  |

- 同じ mutable fact を複数 table / registry / cache に独立正本として書かない。
- queue/event/evidence row に保存する snapshot は immutable evidence として扱い、現在値の参照には使わない。
- projection / cache は source_version 等で出典を持ち、source 更新時に再生成または無効化する。

## 4. エラー処理 [必須]
### 4.1 例外分類（表形式：例外名 / 発生条件 / 伝播先 / ユーザー表示 / 終了コード）
### 4.2 リトライ方針
### 4.3 フォールバック [該当時]

## 5. 既存コードとの取り合い [必須]
### 5.1 依存する既存モジュール
### 5.2 拡張する既存関数
### 5.3 非互換変更の有無

## 6. ログ出力 [必須]
### 6.1 出力ポイント（表形式）
### 6.2 監視連携 [該当時]

## 7. 設定値 [該当時]

## 8. セキュリティ [SPEC §6.3 の実装詳細]

## 9. トレース [必須]
