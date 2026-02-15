# 19_CI_PR_STANDARDS.md - CI/PR 合格基準

> コードがmainにマージされるまでの最終品質ゲート

---

## CI/CD テンプレートライブラリ

プロジェクトタイプ別のGitHub Actionsワークフローは `templates/ci/` を参照。

### テンプレート一覧

```
templates/ci/
├── app.yml       # フルスタックアプリ（PostgreSQL, Redis, 全テスト）
├── api.yml       # API/バックエンド（DB統合テスト重視）
├── lp.yml        # ランディングページ（Lighthouse重視）
├── hp.yml        # ホームページ（Lighthouse + アクセシビリティ）
├── cli.yml       # CLIツール（マルチプラットフォーム）
├── common.yml    # 共通ジョブ定義（再利用可能）
└── deploy/
    ├── dokku.yml   # Dokku デプロイ
    ├── vercel.yml  # Vercel デプロイ
    ├── vps.yml     # VPS (SSH) デプロイ
    └── docker.yml  # Docker イメージ ビルド＆プッシュ
```

### プロジェクトタイプ別 CI 構成

| タイプ | 主要ジョブ | サービス | Critical Gate |
|--------|-----------|----------|---------------|
| **app** | lint, typecheck, unit, api, build, security | PostgreSQL 16, Redis 7 | 全通過 + セキュリティ + ビルド |
| **api** | lint, typecheck, unit, api, integration, security, openapi | PostgreSQL 16, Redis 7 | 全通過 + セキュリティ |
| **lp** | lint, build, lighthouse | なし | ビルド + Lighthouse スコア |
| **hp** | lint, build, lighthouse, accessibility | なし | ビルド + Lighthouse スコア |
| **cli** | lint, typecheck, unit, smoke, build, security | なし | 全通過 + マルチOS |

### 使い方

```bash
# 1. プロジェクト初期化時に自動配置
framework init my-project --type=app

# 2. 手動配置の場合
cp templates/ci/app.yml .github/workflows/ci.yml
sed -i 's/{{PROJECT_NAME}}/my-project/g' .github/workflows/ci.yml

# 3. デプロイワークフロー追加
cp templates/ci/deploy/vercel.yml .github/workflows/deploy.yml
```

### GitHub Secrets 設定手順

#### 共通（全プロジェクトタイプ）

| Secret | 用途 |
|--------|------|
| `CODECOV_TOKEN` | カバレッジレポート（任意） |

#### Vercel デプロイ

| Secret | 取得方法 |
|--------|---------|
| `VERCEL_TOKEN` | Vercel Dashboard > Account Settings > Tokens |
| `VERCEL_ORG_ID` | `vercel link` 後の .vercel/project.json |
| `VERCEL_PROJECT_ID` | 同上 |

#### Dokku デプロイ

| Secret | 取得方法 |
|--------|---------|
| `DOKKU_HOST` | Dokku サーバーのホスト名 |
| `DOKKU_SSH_KEY` | SSH 秘密鍵 |
| `DOKKU_APP_NAME` | `dokku apps:create` で作成したアプリ名 |

#### VPS デプロイ

| Secret | 取得方法 |
|--------|---------|
| `VPS_HOST` | VPS サーバーの IP/ホスト名 |
| `VPS_USER` | SSH ユーザー名 |
| `VPS_SSH_KEY` | SSH 秘密鍵 |
| `VPS_DEPLOY_PATH` | デプロイ先ディレクトリ |
| `VPS_PORT` | SSH ポート（デフォルト: 22） |

#### Docker デプロイ

| Secret | 取得方法 |
|--------|---------|
| `DOCKERHUB_USERNAME` | Docker Hub ユーザー名 |
| `DOCKERHUB_TOKEN` | Docker Hub > Account Settings > Security |

---

## CI パイプライン構成

```
PR作成
  │
  ▼
┌─ CI パイプライン ─────────────────────────────────────┐
│                                                         │
│  Stage 1: 静的解析                        [必須]       │
│  ─────────────────────────────────────────────────     │
│  ✅ TypeScript 型チェック（tsc --noEmit）              │
│  ✅ ESLint（エラー0件）                                │
│  ✅ Prettier（フォーマット差分0件）                    │
│                                                         │
│  Stage 2: 単体テスト                      [必須]       │
│  ─────────────────────────────────────────────────     │
│  ✅ Vitest / Jest 全テストパス                         │
│  ✅ カバレッジ 80%以上                                 │
│                                                         │
│  Stage 3: 統合テスト                      [必須]       │
│  ─────────────────────────────────────────────────     │
│  ✅ API統合テスト全パス                                │
│  ✅ テスト用DB でのマイグレーション成功               │
│                                                         │
│  Stage 4: ビルド                          [必須]       │
│  ─────────────────────────────────────────────────     │
│  ✅ プロダクションビルド成功                           │
│  ✅ バンドルサイズ上限以内                             │
│                                                         │
│  Stage 5: E2Eテスト                       [推奨]       │
│  ─────────────────────────────────────────────────     │
│  ✅ Staging デプロイ成功                               │
│  ✅ Playwright E2Eテスト全パス                         │
│                                                         │
│  Stage 6: セキュリティ                    [推奨]       │
│  ─────────────────────────────────────────────────     │
│  ✅ 依存関係の脆弱性チェック（npm audit）             │
│  ✅ シークレットの漏洩チェック                         │
│                                                         │
└─────────────────────────────────────────────────────────┘
         │
         ▼
全ステージ グリーン → PRレビュー可能
1つでもレッド → マージ不可
```

---

## CI 合格基準（オールグリーンの定義）

```
┌─ CI合格条件 ──────────────────────────────────────────┐
│                                                         │
│  必須（1つでも失敗したらマージ不可）:                   │
│  ✅ TypeScript エラー 0件                              │
│  ✅ ESLint エラー 0件（Warning は許容）                │
│  ✅ Prettier 差分 0件                                  │
│  ✅ 単体テスト 全パス（失敗0件、スキップ0件）         │
│  ✅ 統合テスト 全パス                                  │
│  ✅ カバレッジ 80%以上（新規コードは90%以上）          │
│  ✅ ビルド成功                                         │
│                                                         │
│  推奨（失敗しても状況によりマージ可）:                   │
│  ⚠️ E2Eテスト 全パス                                  │
│  ⚠️ バンドルサイズ上限以内                             │
│  ⚠️ 脆弱性 Critical/High 0件                          │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

---

## PR レビュー基準

### PR作成時の必須事項

```
PRを作成する前のチェックリスト:

□ CIが全てグリーンである
□ PRテンプレートが全て記入されている
□ SSOT準拠チェックが全て ✅ になっている
□ 変更に対応するテストが追加されている
□ スクリーンショットが添付されている（UI変更の場合）
□ 関連Issueがリンクされている
```

### レビュー観点（レビュアー用）

```
┌─ PRレビューチェックリスト ─────────────────────────────┐
│                                                          │
│  1. SSOT準拠性                                          │
│  □ PRテンプレートのSSOT準拠チェックが全て ✅か         │
│  □ SSOTに定義されていない機能が追加されていないか       │
│  □ MUST要件が全て実装されているか                       │
│                                                          │
│  2. コード品質                                          │
│  □ 17_CODE_AUDIT.md の基準を満たしているか              │
│  □ 型安全か（any不使用）                                │
│  □ エラーハンドリングが適切か                            │
│  □ セキュリティリスクがないか                            │
│                                                          │
│  3. テスト                                               │
│  □ SSOTのテストケースが全て実装されているか              │
│  □ テストが意味のあるアサーションをしているか            │
│  □ テストが独立して実行可能か                            │
│                                                          │
│  4. 影響範囲                                            │
│  □ 既存機能を破壊していないか                           │
│  □ 他のSSOTに影響する変更がないか                      │
│  □ 影響がある場合、関連SSOTも更新されているか          │
│                                                          │
│  5. 保守性                                               │
│  □ 将来の変更が容易な構造か                              │
│  □ コメントが適切か                                      │
│  □ 命名が明確か                                          │
│                                                          │
└──────────────────────────────────────────────────────────┘

判定:
  全項目 ✅ → Approve → マージ可能
  1つでも ❌ → Request Changes → 修正後に再レビュー
```

---

## マージからDoneまで

```
  PRレビュー Approve
      │
      ▼
  Squash & Merge（コミット履歴をクリーンに保つ）
      │
      ▼
  マージ後CI（main ブランチ）
  ─────────────────────────
  ✅ 全テスト再実行
  ✅ Staging 自動デプロイ
  ✅ Staging でのスモークテスト
      │
      ▼
  GitHub Projects:
  ─────────────────────────
  タスクステータス → Done
  親Issue の全Sub-issue が Done か確認
  全て Done → 親Issue も Done
      │
      ▼
  ✅ 1タスク完了
```

---

## GitHub Actions テンプレート

```yaml
# .github/workflows/ci.yml

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
        with:
          node-version: '20'
          cache: 'npm'
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
        with:
          node-version: '20'
          cache: 'npm'
      - run: npm ci
      - run: npx vitest run --coverage
      - name: Check coverage
        run: |
          COVERAGE=$(cat coverage/coverage-summary.json | jq '.total.statements.pct')
          if (( $(echo "$COVERAGE < 80" | bc -l) )); then
            echo "Coverage $COVERAGE% is below 80%"
            exit 1
          fi

  integration-test:
    name: Integration Tests
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:15
        env:
          POSTGRES_PASSWORD: test
          POSTGRES_DB: test
        ports:
          - 5432:5432
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
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
        with:
          node-version: '20'
          cache: 'npm'
      - run: npm ci
      - run: npm run build
```

---

## 変更履歴

| 日付 | 変更内容 | 変更者 |
|------|---------|-------|
| | CI/CDテンプレートライブラリ追加（templates/ci/） | |
| | 初版作成 | |
