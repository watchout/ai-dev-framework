# 06_CODE_QUALITY.md - コード品質統合仕様

> 統合元: 17_CODE_AUDIT.md + 18_TEST_FORMAT.md + 19_CI_PR_STANDARDS.md
>
> 実装コードの品質監査、テスト実施フォーマット、CI/PRの合格基準を一元化する。

---

## 1. コード品質監査（Code Audit）

### 1.1 監査プロセス

```
AI実装完了
  ↓
① SSOT準拠チェック（全MUST要件の実装確認）
  ↓
② コード品質スコアリング（100点満点）
  ├── 100点 → 合格 → テストへ
  ├── 90-99点 → 修正プロンプト → AI修正 → 再監査
  └── 89点以下 → 問題箇所特定 → 再実装 → 再監査
```

### 1.2 品質スコアカード（100点満点・合格=100点）

| # | カテゴリ | 配点 | 評価基準 |
|---|---------|------|---------|
| 1 | SSOT準拠性 | 25 | 全MUST要件が実装されているか |
| 2 | 型安全性 | 15 | 型定義の正確性・any不使用 |
| 3 | エラーハンドリング | 15 | 全エラーケースが処理されているか |
| 4 | セキュリティ | 15 | 認証・認可・入力検証・インジェクション |
| 5 | コーディング規約 | 10 | 命名・構造・フォーマット |
| 6 | 保守性 | 10 | 可読性・関数分割・コメント |
| 7 | パフォーマンス | 5 | N+1クエリ・不要な再レンダリング等 |
| 8 | 完全性 | 5 | TODO/FIXME/省略コメントがないか |

### 1.3 カテゴリ別減点基準

#### 1) SSOT準拠性（25点）

```
SSOTの §3 機能要件と照合:
  FR-001 [MUST]: → src/xxx.ts L42-58 ✅
  FR-003 [MUST]: → 該当コードなし ❌

減点: MUST未実装 -5点/件, SHOULD未実装 -2点/件, 独自仕様追加 -3点/件
```

#### 2) 型安全性（15点）

```
チェック: any不使用, unknown+型ガード, 不要なas禁止,
         引数/戻り値の型明示, null/undefined処理, API型のSSOT§5一致

減点: any -3点, 不要as -2点, 型欠落 -2点, null/undefinedチェック漏れ -2点
```

#### 3) エラーハンドリング（15点）

```
SSOTの §9 エラーハンドリングと照合。

減点: 未処理 -3点, 空catch -5点(致命的), メッセージ欠落 -2点, ログ漏れ -1点
```

#### 4) セキュリティ（15点）

```
OWASP Top 10 ベース:
  認証チェック, 認可(RLS), 入力検証(SQL/XSS), データ保護(ログ/env)

減点: 認証漏れ -5点(致命的), 認可漏れ -5点(致命的),
      バリデーション漏れ -3点, envハードコード -3点, 機密ログ -3点
```

#### 5) コーディング規約（10点）

```
CODING_STANDARDS.md と照合: 命名規約, ファイル配置, import順序, 行数上限

減点: 命名違反 -1点(最大-5), ファイル配置違反 -2点, 行数超過 -2点
```

#### 6) 保守性（10点）

```
1関数1責務, 30行目安, マジックナンバー禁止, JSDoc, ネスト3階層以内, DRY

減点: 100行超 -3点, マジックナンバー -1点, 重複コード -2点, ネスト4+ -2点
```

#### 7) パフォーマンス（5点）

```
N+1クエリ, 不要な再レンダリング, メモリ展開, 不要なAPI呼出, インデックス

減点: N+1 -3点, 不要な全件取得 -2点
```

#### 8) 完全性（5点）

```
TODO/FIXME, // ... 省略, console.log, デバッグコード, 未使用import

減点: TODO/FIXME -2点, 省略コメント -3点(致命的), console.log -1点, 未使用import -1点
```

---

## 2. Adversarial Review（敵対的レビュー）

### 2.1 基本思想

```
実装AIとレビューAIを別コンテキストで分離する:

  Role A（実装AI）          Role B（レビューAI）
  SSOTを読む → コードを実装    完成コードを受け取る → SSOTと照合して批判的に検証
       └── 修正 ←──── 指摘 ──┘
             合格するまで反復
```

### 2.2 実行方法

| 方法 | 説明 | 推奨度 |
|------|------|--------|
| Agent Teams | `.claude/agents/code-reviewer.md` に Role B 定義。メインエージェントから委譲 | 推奨 |
| Task tool | Task tool で新エージェント（Role B）を起動し委譲 | 汎用 |
| Claude Code Web | コミット後に非同期レビューを実行 | 非同期向け |
| 別セッション | セッション分離で完全に独立したレビュー | 最も厳格 |

### 2.3 Role B プロンプト

```
あなたは厳格なコードレビュアーです。以下の原則に従ってレビュー:
1. 実装者の意図を汲まない。SSOTとの一致だけを見る
2. 「たぶん大丈夫」は不合格。確実にSSOT一致を確認
3. 問題なしでも確認項目を全てリスト化する
4. 些細な問題も見逃さない（console.log、型の曖昧さ等）

8カテゴリ・100点満点でスコアリングし、100点未満なら具体的修正指示を出す。
```

### 2.4 反復ルール

```
合格条件: Role B が100点を出すこと
反復上限: 3回
3回で合格しない場合 → T3（技術的選択肢）として中断・質問
```

---

## 3. テスト実施フォーマット

### 3.1 条件付きTDD

```
■ TDD強制（テストファースト）:
  条件: プロジェクトタイプ api/cli かつ SSOT層 CORE/CONTRACT
  フロー: SSOT → テスト作成(RED) → 実装(GREEN) → REFACTOR → コード監査

■ TDD任意（後付けテストOK）:
  条件: app/lp/hp、DETAIL層、UI/フロントエンド
  フロー: SSOT → 実装 → コード監査 → テスト作成 → テスト監査 → CI/PR
```

### 3.2 テストレベル

| Level | 種別 | 対象 | ツール | カバレッジ |
|-------|------|------|--------|-----------|
| 1 | 単体テスト | 個々の関数・モジュール | Vitest / Jest | 80%以上 |
| 2 | 統合テスト | APIエンドポイント(DB含) | Vitest + Supertest | 全エンドポイント |
| 3 | E2Eテスト | ユーザー操作フロー全体 | Playwright / Cypress | 主要フロー |

### 3.3 テスト作成原則

```
- テストは仕様（SSOT）に基づく（実装に基づかない）
- 1テスト1アサーションを原則とする
- テスト名は日本語で内容がわかるようにする
- Arrange-Act-Assert パターンを使う
- テストケースIDをテスト名に含める（TC-N-001: ...）
- モックは最小限（外部APIのみモック、DBはテスト用DBを使用）
- テストデータはファクトリ関数で生成
- テスト間の独立性を保つ（順序依存しない）
```

### 3.4 テストレベル別の制約

**単体テスト**:
- SSOTの§10に定義された全テストケースを漏れなく実装
- 省略・TODO・コメントアウト不可
- it.skip / xit / xdescribe 禁止
- ハードコードされた本番データ禁止

**統合テスト**:
- 実際のDB（テスト用）を使用
- テスト前にDBクリーン → シードデータ投入
- 各テスト後にトランザクションロールバック
- 全エンドポイントの正常系+異常系（400/401/403/404/500）

**E2Eテスト**:
- Page Object Model パターンを使用
- テストデータはAPI経由でセットアップ
- スクリーンショットを各ステップで取得
- CI環境でのヘッドレス実行を前提

### 3.5 テスト品質スコアカード（100点満点・合格=100点）

| # | カテゴリ | 配点 | 評価基準 |
|---|---------|------|---------|
| 1 | SSOT網羅性 | 30 | §10の全テストケースが実装されているか |
| 2 | テスト実行結果 | 25 | 全テストがパスするか（1件失敗=0点） |
| 3 | カバレッジ | 15 | 90%+=15, 80-89%=10, 70-79%=5, <70%=0 |
| 4 | テスト品質 | 15 | 独立性(5) + 命名の明確さ(5) + AAA(5) |
| 5 | エッジケース | 10 | 境界値(4) + 空データ(3) + エラーケース(3) |
| 6 | テスト保守性 | 5 | ファクトリ(2) + ヘルパー(2) + データ管理(1) |

---

## 4. CI パイプライン

### 4.1 テンプレートライブラリ

```
templates/ci/
├── app.yml       # フルスタック（PostgreSQL, Redis, 全テスト）
├── api.yml       # API/バックエンド（DB統合テスト重視）
├── lp.yml        # ランディングページ（Lighthouse重視）
├── hp.yml        # ホームページ（Lighthouse + アクセシビリティ）
├── cli.yml       # CLIツール（マルチプラットフォーム）
├── common.yml    # 共通ジョブ定義（再利用可能）
└── deploy/
    ├── dokku.yml / vercel.yml / vps.yml / docker.yml
```

### 4.2 プロジェクトタイプ別構成

| タイプ | 主要ジョブ | サービス | Critical Gate |
|--------|-----------|----------|---------------|
| app | lint, typecheck, unit, api, build, security | PostgreSQL 16, Redis 7 | 全通過+セキュリティ+ビルド |
| api | lint, typecheck, unit, api, integration, security, openapi | PostgreSQL 16, Redis 7 | 全通過+セキュリティ |
| lp | lint, build, lighthouse | なし | ビルド+Lighthouse |
| hp | lint, build, lighthouse, accessibility | なし | ビルド+Lighthouse |
| cli | lint, typecheck, unit, smoke, build, security | なし | 全通過+マルチOS |

### 4.3 CI ステージ

```
Stage 1: 静的解析 [必須]     tsc --noEmit, ESLint(エラー0), Prettier(差分0)
Stage 2: 単体テスト [必須]   Vitest/Jest 全パス, カバレッジ80%+
Stage 3: 統合テスト [必須]   API統合テスト全パス, テストDBマイグレーション成功
Stage 4: ビルド [必須]       プロダクションビルド成功, バンドルサイズ上限以内
Stage 5: E2Eテスト [推奨]    Staging デプロイ+Playwright全パス
Stage 6: セキュリティ [推奨] npm audit, シークレット漏洩チェック
```

### 4.4 CI合格条件

**必須（1つでも失敗 → マージ不可）**:
- TypeScript エラー 0件
- ESLint エラー 0件（Warning は許容）
- Prettier 差分 0件
- 単体テスト 全パス（失敗0件、スキップ0件）
- 統合テスト 全パス
- カバレッジ 80%以上（新規コードは90%以上）
- ビルド成功

**推奨（状況によりマージ可）**:
- E2Eテスト全パス
- バンドルサイズ上限以内
- 脆弱性 Critical/High 0件

### 4.5 GitHub Actions テンプレート

```yaml
name: CI
on:
  pull_request:
    branches: [main]

jobs:
  lint:
    name: Lint & Type Check
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20', cache: 'npm' }
      - run: npm ci
      - run: npx tsc --noEmit
      - run: npx eslint . --max-warnings 0
      - run: npx prettier --check .

  unit-test:
    name: Unit Tests
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20', cache: 'npm' }
      - run: npm ci
      - run: npx vitest run --coverage
      - name: Check coverage
        run: |
          COVERAGE=$(cat coverage/coverage-summary.json | jq '.total.statements.pct')
          if (( $(echo "$COVERAGE < 80" | bc -l) )); then
            echo "Coverage $COVERAGE% is below 80%" && exit 1
          fi

  integration-test:
    name: Integration Tests
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:15
        env: { POSTGRES_PASSWORD: test, POSTGRES_DB: test }
        ports: ['5432:5432']
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20', cache: 'npm' }
      - run: npm ci
      - run: npx vitest run --config vitest.integration.config.ts
        env:
          DATABASE_URL: postgresql://postgres:test@localhost:5432/test

  build:
    name: Build
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20', cache: 'npm' }
      - run: npm ci
      - run: npm run build
```

### 4.6 GitHub Secrets

| カテゴリ | Secret | 用途 |
|---------|--------|------|
| 共通 | `CODECOV_TOKEN` | カバレッジレポート（任意） |
| Vercel | `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID` | Vercelデプロイ |
| Dokku | `DOKKU_HOST`, `DOKKU_SSH_KEY`, `DOKKU_APP_NAME` | Dokkuデプロイ |
| VPS | `VPS_HOST`, `VPS_USER`, `VPS_SSH_KEY`, `VPS_DEPLOY_PATH`, `VPS_PORT` | VPSデプロイ |
| Docker | `DOCKERHUB_USERNAME`, `DOCKERHUB_TOKEN` | Dockerイメージ |

---

## 5. PR レビュー基準

### 5.1 PR作成チェックリスト

```
□ CIが全てグリーン
□ PRテンプレートが全て記入済み
□ SSOT準拠チェックが全て完了
□ 変更に対応するテストが追加済み
□ スクリーンショット添付（UI変更の場合）
□ 関連Issueがリンク済み
```

### 5.2 レビュー観点

| 観点 | チェック項目 |
|------|-------------|
| SSOT準拠性 | SSOT準拠チェック全項目完了、未定義機能の追加なし、MUST要件全実装 |
| コード品質 | 本仕様 1.2 の基準充足、型安全、エラーハンドリング、セキュリティ |
| テスト | SSOTテストケース全実装、意味あるアサーション、独立実行可能 |
| 影響範囲 | 既存機能の非破壊、他SSOT影響時は関連SSOTも更新 |
| 保守性 | 変更容易な構造、適切なコメント、明確な命名 |

### 5.3 マージフロー

```
PR Approve → Squash & Merge → main CI（全テスト再実行 + Staging自動デプロイ）
  → GitHub Projects ステータス更新 → Done
```

---

## 6. 監査レポートテンプレート

### 6.1 コード品質監査レポート

```markdown
# コード品質監査レポート

## 対象
| 項目 | 内容 |
|------|------|
| タスクID | [FEAT-XXX-LAYER] |
| 対象ファイル | [ファイル一覧] |
| 監査日 | [YYYY-MM-DD] |
| 監査回数 | [初回 / 第2回 / ...] |

## SSOT準拠チェック
| 要件ID | レベル | 要件 | 実装箇所 | 結果 |
|--------|--------|------|---------|------|
| FR-001 | MUST | [要件] | src/xxx L42-58 | OK/NG |

## スコア
| # | カテゴリ | 配点 | 得点 | 減点理由 |
|---|---------|------|------|---------|
| 1 | SSOT準拠性 | 25 | /25 | |
| 2 | 型安全性 | 15 | /15 | |
| 3 | エラーハンドリング | 15 | /15 | |
| 4 | セキュリティ | 15 | /15 | |
| 5 | コーディング規約 | 10 | /10 | |
| 6 | 保守性 | 10 | /10 | |
| 7 | パフォーマンス | 5 | /5 | |
| 8 | 完全性 | 5 | /5 | |
| **合計** | | **100** | **/100** | |

## 指摘事項
| # | 重大度 | カテゴリ | ファイル:行 | 指摘内容 | 修正案 |
|---|--------|---------|-----------|---------|-------|
```

### 6.2 テスト品質監査レポート

```markdown
# テスト品質監査レポート

## 対象
| 項目 | 内容 |
|------|------|
| タスクID | [FEAT-XXX-TEST] |
| テストファイル | [ファイル一覧] |
| 監査日 | [YYYY-MM-DD] |

## SSOT網羅性チェック
| テストケースID | テスト名 | 実装 | パス |
|---------------|---------|------|------|
| TC-N-001 | [名前] | OK/NG | OK/NG |

## テスト実行結果
合計: X件 / パス: X件 / 失敗: X件 / スキップ: X件（0件であること）

## カバレッジ
ステートメント: XX% / ブランチ: XX% / 関数: XX% / 行: XX%

## スコア
| # | カテゴリ | 配点 | 得点 | 減点理由 |
|---|---------|------|------|---------|
| 1 | SSOT網羅性 | 30 | /30 | |
| 2 | テスト実行結果 | 25 | /25 | |
| 3 | カバレッジ | 15 | /15 | |
| 4 | テスト品質 | 15 | /15 | |
| 5 | エッジケース | 10 | /10 | |
| 6 | テスト保守性 | 5 | /5 | |
| **合計** | | **100** | **/100** | |
```

---

## 変更履歴

| 日付 | 変更内容 |
|------|---------|
| 2026-02-14 | 初版作成（17_CODE_AUDIT + 18_TEST_FORMAT + 19_CI_PR_STANDARDS を統合） |
