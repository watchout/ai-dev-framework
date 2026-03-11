# タスク順序管理 設計書

> ai-dev-framework におけるタスク管理・実行順序の設計仕様。  
> OpenClaw 配下に依存せず、フレームワーク単体で動作することを前提とする。  
> 監査反映済み: 2026-03-11

---

## 1. 設計思想

### 正本の分離

| 関心事 | 正本 | オンライン要否 |
|--------|------|--------------|
| タスク定義・順序 | GitHub Issues | 必須 |
| 実行ステータス（進行中） | plan.json（ローカル） | 不要 |
| 同期 | `framework sync` | 必須 |

- GitHub Issues = 唯一の正本（SSOT）
- plan.json = 実行中のワーキングコピー（キャッシュ）
- plan.json の順序・タスク定義は `framework sync` のみが更新する（エージェントによる直接書き換え禁止）

### 2フェーズ分離

```
計画フェーズ: framework plan
  → GitHub Issues からタスクを読み込み
  → plan.json を生成（オンライン必須）

実行フェーズ: framework run / framework next / framework current
  → plan.json を参照（オフライン可）
  → ステータスをローカルに書き込む

同期フェーズ: framework sync
  → plan.json の状態を GitHub Issues に反映（オンライン必須）
  → CI hook により PR マージ時に自動実行
```

---

## 2. 実装順序番号（WWWFFFFTTT）

### フォーマット

```
WWWFFFFTTT（10桁固定文字列、ゼロパディング、ハイフンなし）

WWW  = Wave番号    （3桁）
FFFF = Feature番号 （4桁）
TTT  = Task番号    （3桁）
```

### 採番ルール

| 層 | 桁数 | 開始値 | 刻み | 上限 | 枠数 |
|----|------|--------|------|------|------|
| Wave | 3 | 100 | 10 | 990 | 90枠 |
| Feature | 4 | 0100 | 10 | 9990 | 999枠/Wave |
| Task | 3 | 010 | 10 | 990 | 99枠/Feature |

### 例

```
1000100010 → Wave100, Feature0100, Task010(DB)
1000100020 → Wave100, Feature0100, Task020(API)
1000100030 → Wave100, Feature0100, Task030(UI)
1000200010 → Wave100, Feature0200, Task010(DB)
1100100010 → Wave110, Feature0100, Task010(DB)
```

### ソート

10桁固定文字列の辞書順ソート = 実行順序。追加ロジック不要。

```
1000100010 < 1000100020 < 1000200010 < 1100100010
```

---

## 3. コマンド体系

| コマンド | 説明 |
|---------|------|
| `framework plan` | GitHub Issues → plan.json 生成 |
| `framework sync` | plan.json ↔ GitHub Issues の双方向同期 |
| `framework current` | 作業中タスク（status=in_progress）の表示 |
| `framework next` | 次の todo タスクを取得（in_progress があれば警告） |
| `framework next --force` | in_progress を無視して次の todo を取得（並列作業用、ログ記録） |
| `framework run` | タスク実行（sync 状態チェック付き） |
| `framework resequence` | WWWFFFFTTT を10刻みに振り直し |
| `framework resequence --migrate` | 旧フォーマット → WWWFFFFTTT への移行 |
| `framework prune` | orphan タスクの明示的削除 |
| `framework status` | sync 状態・dirty フラグ・lock 状態の確認 |

---

## 4. framework next / current ロジック

### framework current

```
status = in_progress のタスクを返す（なければ空）
```

### framework next

```
status = todo の最小 WWWFFFFTTT を返す
in_progress が存在する場合は警告を出す:
  "Task #42 が作業中です。完了してから next を実行してください"
```

### framework next --force

```
in_progress を無視して次の todo を返す（並列作業用）
audit.log に以下を記録:
  { timestamp, command: "next --force", skipped: [in_progress task ids] }
```

| 状態 | 参照先 |
|------|--------|
| オンライン | GitHub Issues（WWWFFFFTTT ラベル） |
| オフライン | plan.json（WWWFFFFTTT フィールド） |

順序ロジックは同一。取得元のみ異なる。

---

## 5. 挿入ルール

### 通常挿入

既存番号の直後から連番で挿入する。

```
既存: 1000100010, 1000200010
挿入: 1000100011（Feature0100 と Feature0200 の間に差し込み）
```

### resequence

挿入が連続して番号が詰まった場合、`framework resequence` で10刻みに振り直す。  
GitHub Issues のラベルも自動更新する。

### hotfix / 割り込み

特別な予約レンジは持たない。  
割り込みタスクは `framework resequence` で通常 Wave に組み込む。

---

## 6. PR → 最終監査 → マージ → 次タスク フロー

```
実装完了
  → PR 作成（本文に Closes #xxx 必須）
  → CI 実行（pull_request trigger）
  → CI 全通過
  → 最終監査（Final Audit）3フェーズ自動実行
       Phase 1: SSOT準拠最終確認（全MUST要件）
       Phase 2: コード監査（100点スコアカード）
       Phase 3: 破壊的変更・デプロイ影響チェック
                （API契約変更 / DBスキーマ変更 / env vars / マイグレーション有無）
  → 全フェーズ合格
  → マージ承認要求
       ├── GitHub: Required Reviewer に Approve 要求
       └── Telegram 通知（PR URL・監査結果サマリー）
  → CEO: Telegram で承認 → GitHub で Approve 実行
  → Squash & Merge
  → main CI 再実行 → Staging 自動デプロイ
  → GitHub Projects → Done
  → CI hook: framework sync 自動実行（atomic write）
       → GitHub Issue 自動 close
       → plan.json 更新
  → framework next
       → 最小 WWWFFFFTTT の todo を返す
       → 次タスク開始
```

### 最終監査フェーズ詳細

| Phase | 内容 | 判定 |
|-------|------|------|
| Phase 1 | SSOT全MUST要件準拠確認 | 1件でも不備 → Reject |
| Phase 2 | コード監査 100点スコアカード | 閾値未満 → Reject |
| Phase 3 | 破壊的変更チェック（API契約 / DBスキーマ / env vars / migration） | 未申告の破壊的変更 → Reject |

### 人間による停止

- PR に `hold` ラベルを付与 → 自動マージをスキップ
- `framework block <PR番号>` でラベル付与可能

---

## 7. .plan.lock の仕様

### ファイル形式

```json
{
  "pid": 12345,
  "command": "sync",
  "createdAt": "2026-03-10T06:00:00Z",
  "staleAfterMs": 300000
}
```

### 起動時チェックロジック

1. `.plan.lock` が存在しない → 正常。ロック取得して続行
2. 存在する →
   - a. pid が生きている → "別の {command} が実行中です" でブロック
   - b. pid が死んでいる → stale lock。自動削除して警告表示
   - c. `createdAt + staleAfterMs` を超過 → タイムアウト。自動削除して警告表示

---

## 8. sync の冪等性と atomic write

### atomic write フロー

```
1. GitHub Issues を取得（読み取りのみ）
2. plan.json.tmp に新しい状態を書き込む
3. plan.json.tmp → plan.json に atomic rename
4. 失敗時は plan.json.tmp を削除（元の plan.json は無傷）
```

### plan.json メタ情報

```json
{
  "syncedAt": "2026-03-10T06:00:00Z",
  "syncCommit": "abc1234",
  "dirty": false,
  "tasks": [...]
}
```

- `dirty: true` の場合、`framework run` 実行時に警告を表示してブロック
- 同じ状態で何度 sync しても結果が同じ（冪等性）
- 各 Issue の `syncedAt` タイムスタンプで変更検知

---

## 9. orphan 検出

### framework sync 実行時の突合

1. plan.json のタスク一覧と GitHub Issues を突合
2. plan.json にあるが GitHub にない → orphaned として警告:
   ```
   ⚠️ Task #42 (1000100020) は GitHub に存在しません。
   削除: framework prune #42
   維持: framework sync --keep-orphans
   ```
3. GitHub にあるが plan.json にない → 新規タスクとして追加

---

## 10. ズレ防止制約

### 制約一覧

- `framework run` 実行前に sync 状態チェック → `dirty: true` ならブロック
- `framework plan` / `framework sync` 実行中は `.plan.lock` を生成
- PR マージ時は CI hook で `framework sync` を強制実行
- `syncedAt` と GitHub の最終更新を比較。古ければブロック

### リスクと対処

| # | リスク | 対処 |
|---|--------|------|
| ① | sync 失敗 | CI hook の exit code をブロック条件にする |
| ② | Issue リンクなし PR マージ | PR テンプレートで `Closes #xxx` を必須化 |
| ③ | Review Reject 後の宙吊り | Reject 時に plan.json を `review_failed` ステータスに更新 |
| ④ | 並行タスクの sync 競合 | `.plan.lock` で直列化 |
| ⑤ | sync 前の framework next 実行 | `dirty` フラグで run をブロック |
| ⑥ | Wave 境界での未展開 | Wave 境界到達時に次 Wave を plan.json へ自動展開 |
| ⑦ | sync 途中のネットワーク断 | atomic write + dirty フラグ |
| ⑧ | .plan.lock の残存 | PID + タイムアウトで自動解除 |
| ⑨ | GitHub Issue 外部削除 | orphan 検出 + framework prune |
| ⑩ | 古い plan.json での run | syncedAt と GitHub の最終更新を比較。古ければブロック |

---

## 11. 実装対象ファイル

| ファイル | 変更内容 |
|---------|---------|
| `src/cli/lib/plan-model.ts` | Task/Feature に `seq: string`（WWWFFFFTTT）フィールド追加 |
| `src/cli/lib/plan-engine.ts` | plan 生成時に seq 番号を自動付与するロジック追加 |
| `src/cli/lib/github-model.ts` | Issue ラベルに WWWFFFFTTT を付与 |
| `src/cli/lib/run-engine.ts` | `framework next` / `framework current` を実装 |
| `src/cli/lib/status-engine.ts` | dirty フラグ・syncedAt チェック追加 |
| `src/cli/lib/sync-engine.ts` | 新規: `framework sync`（atomic write・orphan 検出・冪等性） |
| `src/cli/lib/resequence-engine.ts` | 新規: `framework resequence`（--migrate オプション含む） |
| `src/cli/lib/lock-model.ts` | 新規: `.plan.lock` PID + タイムアウト管理 |
| `src/cli/lib/prune-engine.ts` | 新規: `framework prune` |
| `audit.log` | `framework next --force` 使用時の audit trail |

---

## 12. 設計原則まとめ

1. **実行順序は WWWFFFFTTT のみで決まる** — 他のフィールドや外部ロジック不要
2. **GitHub Issues が正本** — plan.json は一時的なワーキングコピー
3. **sync は CI が自動実行** — 手動 sync 忘れを防ぐ
4. **atomic write で破損を防ぐ** — tmpfile + rename で中断に強い
5. **挿入は連番、整理は resequence** — renumbering のタイミングを明示的に管理
6. **hotfix に特別扱いなし** — resequence で通常フローに統合する
7. **current と next を分離** — 「今何をやっている」と「次は何か」を明確に分ける
8. **--force は audit trail 必須** — 並列作業の透明性を確保する
