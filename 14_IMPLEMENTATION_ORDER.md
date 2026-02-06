# 14_IMPLEMENTATION_ORDER.md - 実装順序・タスク分解・開発環境

> SSOTから開発タスクを分解し、GitHub Projects + GitHub Issues で管理・実装する

---

## 基本原則

```
SSOT = 機能の真実の源泉（1つの仕様書に全て記載）
タスク = SSOTの特定セクションを実装する作業単位

タスクはSSOTを「参照」する。タスク固有のSSOTは作らない。

  SSOT（ログイン機能）
  ├── §4 データ仕様    ← Task 1 が参照して実装
  ├── §5 API仕様       ← Task 2 が参照して実装
  ├── §6 UI仕様        ← Task 3 が参照して実装
  ├── §7 ビジネスルール ← Task 2, 3 が参照して実装
  └── §10 テストケース  ← Task 4 が参照して実装
```

---

## Part 1: 実装順序の決定

### 優先度の定義（P0 / P1 / P2）

```
SSOTの §1 に記載する優先度の判定基準:

  P0（最優先 - なければプロダクトが成立しない）
  ──────────────────────────────────────────
  判定条件（全て AND）:
  ✅ この機能がないとユーザーが主目的を達成できない
  ✅ MVP（Minimum Viable Product）に含まれる
  ✅ 代替手段がない

  例: ログイン、商品検索（ECサイトの場合）、
      画像分析（画像分析サービスの場合）

  P1（重要 - ないとプロダクトの価値が大幅に下がる）
  ──────────────────────────────────────────
  判定条件（いずれか 1つ以上）:
  ✅ ユーザー体験を大幅に向上させる
  ✅ ビジネス目標の達成に直結する
  ✅ 主要なユーザーフローの一部である

  例: お気に入り登録、履歴表示、
      プッシュ通知、プロフィール編集

  P2（あると良い - なくてもプロダクトとして機能する）
  ──────────────────────────────────────────
  判定条件:
  ✅ P0でもP1でもないもの全て

  例: テーマカスタマイズ、エクスポート、
      詳細な分析ダッシュボード

  判定フロー:
  ┌──────────────────────────────────────┐
  │ この機能なしでプロダクトは成立するか？ │
  │                                        │
  │   No → P0                              │
  │   Yes → ユーザー体験に大きく影響するか？│
  │           Yes → P1                      │
  │           No  → P2                      │
  └──────────────────────────────────────┘
```

### 推定規模の定義（S / M / L / XL）

```
SSOTの §1 に記載する推定規模の判定基準:

  S（Small）: 1〜2日
  ──────────────────
  - SSOTの §3 要件が 5個以下
  - 画面が 1つ
  - APIエンドポイントが 1〜2個
  - 例: ログアウト、プロフィール表示

  M（Medium）: 3〜5日
  ──────────────────
  - SSOTの §3 要件が 6〜12個
  - 画面が 1〜2つ
  - APIエンドポイントが 3〜5個
  - 例: ログイン、サインアップ、基本的なCRUD

  L（Large）: 6〜10日
  ──────────────────
  - SSOTの §3 要件が 13〜20個
  - 画面が 3〜5つ
  - APIエンドポイントが 6〜10個
  - 外部API連携あり
  - 例: 画像分析フロー、決済フロー

  XL（Extra Large）: 11日以上
  ──────────────────
  - SSOTの §3 要件が 21個以上
  - 画面が 6つ以上
  - APIエンドポイントが 11個以上
  - 複数の外部API連携
  - XLの場合、機能をさらに分割できないか検討すること
```

### Phase 1: 共通機能（土台）

```
必ず最初に実装する。全ての個別機能が依存するため。

Layer 0: インフラ・環境構築
──────────────────────────
  - リポジトリ作成 + ブランチ戦略設定
  - CI/CD パイプライン構築
  - DBマイグレーション基盤
  - デプロイ基盤（Staging/Production）
  - 開発環境セットアップスクリプト

      ↓

Layer 1: 認証基盤
──────────────────────────
  - AUTH-001: ログイン
  - ACCT-001: サインアップ
  - AUTH-005: ログアウト
  - メール認証
  ※ ほぼ全機能が認証に依存するため最優先

      ↓

Layer 2: 共通UI基盤
──────────────────────────
  - レイアウトシェル（ヘッダー、サイドバー、フッター）
  - 共通コンポーネントライブラリ
  - エラー表示 / ローディング / 空状態

      ↓

Layer 3: その他の共通機能
──────────────────────────
  - 通知基盤（必要な場合）
  - ファイルアップロード基盤（必要な場合）
  - 決済基盤（必要な場合）
  ※ 個別機能が依存するもののみ先行して実装

  Layer 3 内の順序決定:
  ──────────────────────
  1. 個別機能の §11 を全件スキャンし、
     各共通機能を依存先として参照している個別機能の数をカウント

     例:
     ファイルアップロード ← FEAT-001, FEAT-003, FEAT-007 → 3件
     通知               ← FEAT-002, FEAT-005           → 2件
     決済               ← FEAT-004                     → 1件

  2. 被依存数が多い順に実装
     → ファイルアップロード → 通知 → 決済

  3. 同数の場合: Wave 1の機能が依存する方を優先
```

### Phase 2: 個別機能（依存関係ベースで自動決定）

```
決定アルゴリズム:

Step 1: 依存グラフの構築
────────────────────────
  全SSOTの §11（依存関係）から有向グラフを作成。
  ノード = 機能ID、エッジ = 依存関係（A→Bは「AがBに依存」）

Step 2: 循環依存の検出と解消
────────────────────────
  グラフに循環がないか検出する。

  循環が検出された場合の解消手順:
  ① 循環に含まれる機能を特定
     例: FEAT-A → FEAT-B → FEAT-C → FEAT-A

  ② 各依存の「依存内容」を分析し、最も弱い依存を特定
     弱い依存 = 機能の一部しか使わない / 後から結合できる

  ③ 最も弱い依存を切断し、段階的に実装
     例: FEAT-A の FEAT-C への依存が「結果表示のみ」
     → FEAT-A を先に実装（FEAT-C連携部分はスタブ）
     → FEAT-C 完成後に結合

  ④ 切断した依存には結合タスクを追加
     → FEAT-A-INTEGRATE-C を後続Waveに配置

  ⑤ 循環が解消できない場合 → T7（ビジネス判断）として
     ユーザーに中断・質問する（21_AI_ESCALATION.md）

Step 3: トポロジカルソートで Wave に分類
────────────────────────
  Wave 1: 依存ゼロの機能（共通機能のみに依存）
  Wave 2: Wave 1 の機能に依存する機能
  Wave 3: Wave 2 の機能に依存する機能
  ...

Step 4: 同一 Wave 内の優先順位（タイブレークルール）
────────────────────────
  以下の順に比較し、先に差がついた時点で決定:

  ルール1: 優先度
    P0 > P1 > P2

  ルール2: 被依存数（直接依存のみカウント）
    他の機能から多く依存される方を優先
    ※ この機能が遅れると後続機能が全てブロックされるため

  ルール3: 推定規模
    S > M > L > XL（小さい方を優先）
    ※ 早く完了させてブロック解除する

  ルール4: 機能ID の昇順
    全条件が同一の場合の最終タイブレーク
    ※ 恣意性を排除するための機械的ルール

  例:
  | 機能 | P | 被依存数 | 規模 | → 順位 |
  |------|---|---------|------|--------|
  | FEAT-001 | P0 | 3 | M | 1位（P0かつ被依存最多） |
  | FEAT-002 | P0 | 1 | S | 2位（P0だが被依存少） |
  | FEAT-003 | P1 | 5 | L | 3位（P1なのでP0の後） |
  | FEAT-004 | P1 | 5 | S | 4位（同P1同被依存、規模で差） |
  | FEAT-005 | P1 | 5 | S | 5位（全同一、IDの昇順） |

Step 5: 並行開発可能な組み合わせを特定
────────────────────────
  同一Wave内は並行開発可能。
  ただし同一DBテーブルを変更する機能は順序を守る。
```

### AIへの指示

```
以下の全SSOTの §1（優先度・規模）と §11（依存関係）を分析し、
実装順序を決定してください。

[各SSOTの §1 と §11 をペースト]

決定手順:
1. 依存グラフを構築
2. 循環依存があれば検出し、解消案を提示（承認を待つ）
3. トポロジカルソートでWave分類
4. 同一Wave内をタイブレークルールで順位付け
   （P0>P1>P2 → 被依存数 → 規模 → 機能ID昇順）

出力形式:
━━━━━━━━━━━━━━━━━━━━━
Phase 1: 共通機能
  Layer 0: [環境構築タスク]
  Layer 1: [認証系]
  Layer 2: [共通UI]
  Layer 3: [その他共通（被依存数順）]

Phase 2: 個別機能
  Wave 1: [機能リスト（順位付き）]
  Wave 2: [機能リスト（順位付き）]
  Wave 3: [機能リスト（順位付き）]

依存関係グラフ（Mermaid）:
  [グラフ出力]

循環依存（検出された場合）:
  [循環の内容と解消案]
```

---

## Part 1.5: 縦スライス（Vertical Slice）

### 基本概念

```
従来: 機能別の横割り
  「ログイン機能」→ DB → API → UI → テスト

問題:
  - 1つの機能が完成するまでユーザー価値が見えない
  - 「DB全部やってからAPI全部やる」→ 結合時に問題発覚
  - 依存関係の解消が遅れる

改善: ユーザー価値単位の縦スライス
  「初回利用者がサービスを使い始めるまで」
  = サインアップ + ログイン + オンボーディング + メイン画面表示

  1スライス = 1つのユーザー価値を端から端まで（DB → API → UI → テスト）
```

### スライスの切り方ガイドライン

```
■ 良いスライス:
────────────────────────────────
  ✅ 1スライスで「ユーザーが○○できるようになる」と言える
  ✅ 1スライスがデモ可能（動く状態）
  ✅ 1スライスがフィードバック可能
  ✅ 1スライスが独立してリリースできる

■ 悪いスライス:
────────────────────────────────
  ❌ 「DB層を全部実装する」（横割り）
  ❌ 「認証機能」（大きすぎる）
  ❌ 「APIのバリデーション」（部分的すぎて価値がない）
  ❌ 「管理画面」（ユーザー価値が見えない）

■ スライスの粒度:
────────────────────────────────
  1スライス = 2-5日で完了できる量
  1スライス = Freeze → 実装 → 監査 → 運用確認 の全工程
```

### スライスの例

```
例: 飲食店予約サービス

  従来（横割り）:
  ├── Wave 1: AUTH-001(ログイン), ACCT-001(サインアップ)
  ├── Wave 2: BOOK-001(予約作成), SHOP-001(店舗検索)
  └── Wave 3: NOTIFY-001(通知), REVIEW-001(レビュー)

  改善（縦スライス）:
  ├── Slice 1: 「初めてのお客さんが店を見つけて予約する」
  │   = ACCT-001(サインアップ) + AUTH-001(ログイン)
  │     + SHOP-001(店舗検索・一覧) + BOOK-001(予約作成)
  │   ※ 各機能は MVP最小セット
  │   ※ これだけで「使える」状態
  │
  ├── Slice 2: 「予約したお客さんが来店後にレビューする」
  │   = BOOK-002(予約確認) + REVIEW-001(レビュー投稿)
  │   ※ Slice 1 の拡張
  │
  ├── Slice 3: 「リピーターが簡単に再予約する」
  │   = BOOK-003(再予約) + FAVOR-001(お気に入り)
  │     + NOTIFY-001(予約リマインド)
  │
  └── Slice 4: 「店舗オーナーが予約を管理する」
      = ADMIN-001(予約管理) + ADMIN-002(空き枠設定)
```

### スライスの決定手順

```
Step 1: ユーザージャーニーを描く
────────────────────────────────
  プライマリペルソナの「初回利用 → 価値体験 → リピート」を
  ステップバイステップで描く。

  ジャーニー:
  1. サービスを知る
  2. アカウントを作る
  3. メイン機能を使う ← 最初の価値体験
  4. 結果を確認する
  5. 再度使う
  6. 他の人に勧める

Step 2: ジャーニーを区切る
────────────────────────────────
  各ステップに必要な機能を列挙し、
  「ユーザーが○○できるようになる」単位で区切る。

  区切りの基準:
  - 1区切り = 1つの明確なユーザー価値
  - 前の区切りが完成していないと次が使えない
  - 各区切りが独立してデモ・テスト可能

Step 3: 各スライスの機能を最小化
────────────────────────────────
  各スライスに含まれる機能を MVP 最小セットに絞る。

  例: Slice 1 の「店舗検索」は:
  - MVP: 名前で検索 + 一覧表示
  - 後回し: 地図検索、カテゴリ絞り込み、お気に入り

Step 4: Wave との対応付け
────────────────────────────────
  各スライスを依存関係を考慮してWaveに配置。
  スライス内の機能は同一Waveに配置するのが望ましい。

  Slice 1 → Wave 1（最初にやる）
  Slice 2 → Wave 2
  Slice 3 → Wave 3
```

### スライス実行サイクル

```
各スライスの実行:

  ┌─────────────────────────────────────────────┐
  │  Slice N: 「ユーザーが○○できるようになる」   │
  ├─────────────────────────────────────────────┤
  │                                               │
  │  1. Freeze 1-2（仕様確定）                   │
  │     → 含まれる機能のCORE/CONTRACT層を確定     │
  │                                               │
  │  2. 実装（DB → API → UI → 結合）              │
  │     → 含まれる全機能を縦に貫通して実装         │
  │     → Freeze 3-4 は並行して進める             │
  │                                               │
  │  3. 監査                                      │
  │     → コード監査 + テスト監査                 │
  │     → SSOT監査は Freeze 4 完了後              │
  │                                               │
  │  4. 運用確認                                  │
  │     → デモ可能な状態か確認                    │
  │     → ユーザーフィードバック取得              │
  │                                               │
  │  5. 次のスライスへ                            │
  └─────────────────────────────────────────────┘
```

### AIへの指示（スライス決定）

```
以下のユーザーペルソナと機能カタログから、
縦スライスを決定してください。

ペルソナ: [USER_PERSONA.md の内容]
機能カタログ: [SSOT-1_FEATURE_CATALOG.md の内容]

決定手順:
1. プライマリペルソナのユーザージャーニーを描く
2. 「ユーザーが○○できるようになる」単位で区切る
3. 各スライスに必要な機能をMVP最小セットで列挙
4. スライス間の依存関係を確認
5. Wave に割り当て

出力形式:
  Slice 1: 「[ユーザー価値]」
    機能: [機能IDリスト（MVPセット）]
    Wave: 1
    完了時: 「[何ができるようになるか]」

  Slice 2: 「[ユーザー価値]」
    機能: [機能IDリスト]
    Wave: 2
    依存: Slice 1
```

---

## Part 2: SSOTからタスク分解

### タスク分解ルール

```
1つのSSO → 5〜8個のタスクに分解するのが標準

分解パターン（固定）:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  SSOT [FEAT-XXX]
    │
    ├── Task 1: DB（データ層）
    │   参照: §4 データ仕様
    │   内容: マイグレーション作成、シード、インデックス
    │
    ├── Task 2: API（サーバー層）
    │   参照: §5 API仕様 + §7 ビジネスルール + §9 エラー
    │   内容: エンドポイント実装、バリデーション、エラーハンドリング
    │
    ├── Task 3: UI（プレゼンテーション層）
    │   参照: §6 UI仕様
    │   内容: 画面実装、状態管理、操作フロー
    │
    ├── Task 4: 結合（API + UI接続）
    │   参照: §5 + §6
    │   内容: フロントとバックの接続、E2Eフロー確認
    │
    ├── Task 5: テスト
    │   参照: §10 テストケース
    │   内容: 単体テスト、統合テスト、E2Eテスト
    │
    └── Task 6: レビュー + ドキュメント更新
        参照: SSOT全体
        内容: コードレビュー、SSOTと実装の乖離確認

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

### タスクの粒度基準

```
1タスク = 1人が1〜3日で完了できる作業量

大きすぎる場合 → サブタスクに分割
  例: Task 2 が大きい場合
  → Task 2-a: CRUDエンドポイント実装
  → Task 2-b: ビジネスルール実装
  → Task 2-c: エラーハンドリング実装

小さすぎる場合 → 他タスクに統合
  例: Task 1 が CREATE TABLE 1つだけ
  → Task 2 に統合
```

### タスク定義のフォーマット

```markdown
## [タスクID] [タスク名]

### 概要
[このタスクで何を実装するか（1-2文）]

### 参照SSOT
- 機能ID: [FEAT-XXX]
- 参照セクション: §X, §Y

### 完了条件（Definition of Done）
- [ ] [具体的な完了条件1]
- [ ] [具体的な完了条件2]
- [ ] コードレビュー通過
- [ ] 該当テスト全てパス

### 依存
- Blocked by: [先行タスクID]
- Blocks: [後続タスクID]

### 推定
- 規模: S / M / L
- 推定時間: X日
- 担当: [アサイン先]
```

---

## Part 3: タスク管理ツール連携

### 構成

```
┌─────────────────────────────────┐     ┌─────────────┐
│ GitHub                          │     │ Claude Code  │
│  ├── Projects（タスク管理）     │────→│              │
│  ├── Issues（タスク詳細）       │     │ 実装         │
│  └── PR（コードレビュー）       │     │              │
└─────────────────────────────────┘     └─────────────┘
                 │                             │
                 └─────────────────────────────┘
                               │
                        docs/（SSOT）= 真実の源泉
```

### GitHub Projects の構成

```
GitHub Project（プロジェクトボード）
  │
  ├── View: Board（カンバン）
  │   └── カラム: Backlog → Todo → In Progress → In Review → Done
  │
  ├── View: Table（一覧）
  │   └── フィールド: Phase, Wave, Priority, Size, Feature ID
  │
  ├── Iteration: Layer 0 - 環境構築
  ├── Iteration: Layer 1 - 認証基盤
  ├── Iteration: Wave 1 - [機能群]
  ├── Iteration: Wave 2 - [機能群]
  └── Iteration: Wave 3 - [機能群]

各Iteration内（GitHub Issues）:
  ├── 親Issue: [FEAT-XXX] [機能名]
  │   ├── Tasklist: [FEAT-XXX-DB] DB実装
  │   ├── Tasklist: [FEAT-XXX-API] API実装
  │   ├── Tasklist: [FEAT-XXX-UI] UI実装
  │   ├── Tasklist: [FEAT-XXX-INT] 結合
  │   ├── Tasklist: [FEAT-XXX-TEST] テスト
  │   └── Tasklist: [FEAT-XXX-REVIEW] レビュー
  │
  └── 親Issue: [FEAT-YYY] [機能名]
      └── ...

Claude Code Web の非同期タスク:
  → PR 自動作成 → Project に自動追加（Workflow設定）
```

### Issue テンプレート

```markdown
## [FEAT-XXX-DB] [機能名] - DB実装

### SSOT参照
📄 docs/design/features/[common|project]/FEAT-XXX_[name].md
📌 参照セクション: §4 データ仕様

### 概要
[SSOTの§4の要約を記載]

### 完了条件
- [ ] マイグレーションファイル作成
- [ ] テーブル定義がSSOT §4と完全一致
- [ ] インデックス設定
- [ ] シードデータ（必要な場合）
- [ ] マイグレーション実行確認（dev環境）
- [ ] コードレビュー通過

### ブランチ
`feature/FEAT-XXX-db`

### 依存
- Blocked by: なし（または先行タスク）
- Blocks: FEAT-XXX-API

### 推定
- Size: S / M / L
- Points: X

### Labels
`feature` `database` `FEAT-XXX` `wave-1`
```

### ステータスフロー

```
GitHub Projects ステータス:

  Backlog → Todo → In Progress → In Review → Done
                       │              │
                       │              ├── PR作成 → 自動でProject更新
                       │              └── レビュー依頼
                       │
                       └── Claude Code Web: & で非同期実行
                                            → PR自動作成 → In Review へ

対応するGitフロー:
  ブランチ作成 → コミット → PR作成 → レビュー → マージ → Issue自動クローズ
```

### AIへの指示（タスク管理ツール設定）

```
以下のSSOT一覧から、GitHub Issues の
Issue構成を生成してください。

SSOTリスト:
[機能カタログをペースト]

実装順序:
[Part 1で決定した順序をペースト]

各機能について:
1. 親Issueを作成（機能名、概要、SSOT参照リンク）
2. Sub-issueを5-6個作成（DB/API/UI/結合/テスト/レビュー）
3. 各Sub-issueに完了条件とSSOT参照セクションを記載
4. 依存関係を設定
5. Cycleに割り当て

出力: 各Issueのタイトルと本文（コピペでそのまま使える形式）
```

---

## Part 4: GitHub 開発ワークフロー

### リポジトリ構成

```
my-project/
├── .github/
│   ├── workflows/
│   │   ├── ci.yml              ← PR時の自動テスト
│   │   ├── cd-staging.yml      ← Staging自動デプロイ
│   │   └── cd-production.yml   ← Production手動デプロイ
│   ├── ISSUE_TEMPLATE/
│   │   ├── feature-db.md       ← DB実装Issueテンプレート
│   │   ├── feature-api.md      ← API実装Issueテンプレート
│   │   ├── feature-ui.md       ← UI実装Issueテンプレート
│   │   ├── feature-test.md     ← テストIssueテンプレート
│   │   └── bug.md              ← バグ報告テンプレート
│   └── PULL_REQUEST_TEMPLATE.md
│
├── CLAUDE.md                    ← Claude Code 指示書
├── docs/                        ← SSOT（仕様書一式）
├── src/
└── ...
```

### ブランチ戦略（GitHub Flow ベース）

```
main
  │  ← 常にデプロイ可能な状態
  │
  ├── feature/FEAT-XXX-db        ← DB実装
  │     └── PR → main
  │
  ├── feature/FEAT-XXX-api       ← API実装
  │     └── PR → main
  │
  ├── feature/FEAT-XXX-ui        ← UI実装
  │     └── PR → main
  │
  ├── feature/FEAT-XXX-integration ← 結合
  │     └── PR → main
  │
  ├── fix/FEAT-XXX-[description]  ← バグ修正
  │     └── PR → main
  │
  └── hotfix/[description]        ← 緊急修正
        └── PR → main

命名規約:
  feature/[機能ID]-[レイヤー]    例: feature/FEAT-001-api
  fix/[機能ID]-[説明]            例: fix/FEAT-001-validation-error
  hotfix/[説明]                  例: hotfix/auth-session-expire
```

### コミットメッセージ規約

```
Conventional Commits 準拠:

  feat(FEAT-XXX): [説明]        ← 新機能
  fix(FEAT-XXX): [説明]         ← バグ修正
  refactor(FEAT-XXX): [説明]    ← リファクタリング
  test(FEAT-XXX): [説明]        ← テスト追加
  docs(FEAT-XXX): [説明]        ← ドキュメント更新
  chore: [説明]                  ← ビルド・設定変更

例:
  feat(AUTH-001): ログインAPIエンドポイントを実装
  fix(AUTH-001): パスワードバリデーションのバグを修正
  test(AUTH-001): ログイン異常系テストを追加
```

### Pull Request テンプレート

```markdown
## 概要
<!-- このPRで何を実装/修正したか -->

## SSOT参照
- 機能ID: FEAT-XXX
- 参照セクション: §X
- 📄 SSOT: docs/design/features/xxx/FEAT-XXX_name.md

## 変更内容
- [ ] 変更点1
- [ ] 変更点2

## SSOT準拠チェック
- [ ] SSOTの §3 機能要件の MUST を全て満たしている
- [ ] SSOTの §4 データ仕様と実装が一致
- [ ] SSOTの §5 API仕様と実装が一致
- [ ] SSOTの §7 ビジネスルールが正しく実装されている
- [ ] SSOTの §10 テストケースが全て実装されている

## テスト
- [ ] 単体テスト追加
- [ ] 統合テスト追加
- [ ] 既存テスト全てパス

## スクリーンショット
<!-- UI変更の場合 -->

## 関連Issue
Closes #XXX
```

### CI/CD パイプライン

```yaml
# .github/workflows/ci.yml の構成

PR作成時:
  1. リント（ESLint / Prettier）
  2. 型チェック（TypeScript）
  3. 単体テスト
  4. 統合テスト
  5. ビルド確認
  6. （任意）Staging自動デプロイ + E2Eテスト

mainマージ時:
  1. Staging自動デプロイ
  2. E2Eテスト実行
  3. （手動承認後）Production デプロイ
```

---

## Part 5: 一気通貫フロー（SSOT → 完成）

### 1つの機能の完全なフロー

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  SSOT完成（監査95点合格）
        │
        ▼
  ① タスク分解 [Claude Code]
     claude "FEAT-XXX のSSOTを読んで、
            開発タスクを分解して。
            GitHub Issues用のIssue本文も生成して"
        │
        ▼
  ② Issue作成 [GitHub Projects]
     - 親Issue: FEAT-XXX（Tasklist付き）
     - Tasklist: DB / API / UI / 結合 / テスト / レビュー
     - Labels で依存関係を表現
     - Iteration に割り当て
        │
        ▼
  ③ DB実装 [Claude Code → GitHub]
     - ブランチ: feature/FEAT-XXX-db
     - claude "SSOTの§4に基づいてマイグレーション作成"
     - コミット + PR作成
     - CI通過 → レビュー → マージ
     - GitHub Projects: FEAT-XXX-DB → Done
        │
        ▼
  ④ API実装 [Claude Code → GitHub]
     - ブランチ: feature/FEAT-XXX-api
     - Claude Code で §5 + §7 を参照しながら実装
     - コミット + PR作成
     - CI通過 → レビュー → マージ
     - GitHub Projects: FEAT-XXX-API → Done
        │
        ▼
  ⑤ UI実装 [Claude Code → GitHub]
     - ブランチ: feature/FEAT-XXX-ui
     - Claude Code で §6 を参照しながら実装
     - コミット + PR作成
     - CI通過 → レビュー → マージ
     - GitHub Projects: FEAT-XXX-UI → Done
        │
        ▼
  ⑥ 結合 [Claude Code → GitHub]
     - ブランチ: feature/FEAT-XXX-integration
     - フロント ↔ バックを接続
     - E2Eフロー確認
     - CI通過 → レビュー → マージ
     - GitHub Projects: FEAT-XXX-INT → Done
        │
        ▼
  ⑦ テスト [Claude Code → GitHub]
     - ブランチ: feature/FEAT-XXX-test
     - claude "SSOTの§10に基づいてテスト作成"
     - CI通過 → レビュー → マージ
     - GitHub Projects: FEAT-XXX-TEST → Done
        │
        ▼
  ⑧ 最終レビュー
     - SSOT §3 の全MUST要件が実装されているか確認
     - GitHub Projects: 親Issue FEAT-XXX → Done

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  ✅ 1機能完成 → 次の機能へ
```

### Claude Code での具体的な使い方

```
# タスク分解（Claude Code）
claude "docs/design/features/project/FEAT-001_image_analysis.md を読んで:
       1. 開発タスクを DB/API/UI/結合/テスト/レビュー に分解
       2. 各タスクの完了条件をSSOT参照セクション付きで生成
       3. GitHub Issues用のIssue本文をMarkdownで出力"

# DB実装（Claude Code）
claude "docs/design/features/project/FEAT-001_image_analysis.md の §4 に基づいて
       DBマイグレーションを作成して。
       docs/design/core/SSOT-4_DATA_MODEL.md との整合性も確認して"

# API実装（Claude Code）
claude "docs/design/features/project/FEAT-001_image_analysis.md の §5 と §7 に基づいて
       APIエンドポイントを実装して。
       docs/design/core/SSOT-3_API_CONTRACT.md の規約に従って"

# テスト作成（Claude Code）
claude "docs/design/features/project/FEAT-001_image_analysis.md の §10 に基づいて
       テストを一括生成して。
       正常系、異常系、境界値を全てカバーして"

# SSOT準拠チェック（Claude Code）
claude "src/features/image-analysis/ の実装が
       docs/design/features/project/FEAT-001_image_analysis.md の
       §3 の全MUST要件を満たしているか確認して。
       乖離があれば一覧で報告して"
```

---

## Part 6: チーム開発の場合

### 並行開発マップ

```
            Week 1       Week 2       Week 3       Week 4
開発者A:  AUTH-001 →   FEAT-001-DB → FEAT-001-API → FEAT-001-UI
開発者B:  ACCT-001 →   FEAT-002-DB → FEAT-002-API → FEAT-002-UI
開発者C:  共通UI基盤 → FEAT-001-TEST→ FEAT-002-TEST→ 結合テスト

ルール:
- 同一機能のDB→API→UIは順序を守る
- 異なる機能間は同一レイヤーを並行開発可能
- 結合タスクは該当機能のDB/API/UIが全て完了後
```

### コードオーナーシップ

```
# .github/CODEOWNERS

# 共通機能
/src/features/auth/       @auth-owner
/src/features/account/    @auth-owner

# 個別機能
/src/features/image-analysis/  @feature-owner-a
/src/features/dashboard/       @feature-owner-b

# SSOT（仕様書の変更は全員レビュー）
/docs/design/core/        @tech-lead
/docs/standards/           @tech-lead
```

---

## 変更履歴

| 日付 | 変更内容 | 変更者 |
|------|---------|-------|
| | 初版作成 | |
| | 縦スライス（Vertical Slice）を追加。Cursor参照をClaude Codeに統一 | |
