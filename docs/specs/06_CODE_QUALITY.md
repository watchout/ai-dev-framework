# 06_CODE_QUALITY.md - コード品質統合仕様

> 統合元: 17_CODE_AUDIT.md + 18_TEST_FORMAT.md + 19_CI_PR_STANDARDS.md
>
> 実装コードの品質監査、テスト実施フォーマット、CI/PRの合格基準を一元化する。

---

## 1. コード品質チェック（Code Quality Check）

> **v1.1.0 改訂** (#62): AI スコアリング (100点満点) を廃止し、決定論的チェックリスト (pass/fail) に移行。
> 品質は linter + 型チェック + 明示ルールで検証する。LLM による主観的スコアリングは行わない。

### 1.1 チェックプロセス

```
実装完了
  ↓
① 静的解析 (自動: tsc --noEmit + ESLint + Prettier)
  ├── エラー 0件 → PASS
  └── エラーあり → FAIL → 修正 → 再実行
  ↓
② SSOT 準拠チェック (決定論的: MUST 要件の実装確認)
  ├── 全 MUST 実装済み → PASS
  └── 未実装あり → FAIL → 修正 → 再チェック
  ↓
③ セキュリティチェック (自動: npm audit + secrets scan)
  ├── Critical/High 0件 → PASS
  └── 検出あり → FAIL → 修正
  ↓
全 PASS → テストへ
```

### 1.2 品質チェックリスト（pass/fail）

| # | カテゴリ | 判定方法 | 合格基準 |
|---|---------|---------|---------|
| 1 | 型安全性 | `tsc --noEmit` | エラー 0件 |
| 2 | Lint | `eslint --max-warnings 0` | エラー 0件、Warning 0件 |
| 3 | フォーマット | `prettier --check` | 差分 0件 |
| 4 | SSOT 準拠性 | MUST 要件と実装の照合 (checklist) | 全 MUST 実装済み |
| 5 | セキュリティ | `npm audit` + secrets scan | Critical/High 0件 |
| 6 | 完全性 | pre-commit hook (console.log, TODO/FIXME, .skip/.only) | 検出 0件 |

全項目 PASS が合格条件。部分点やスコアリングは行わない。

### 1.3 ESLint ルールによる品質担保

v1.0.0 で定義していた 8 カテゴリ × 配点方式のスコアリングは廃止。
品質基準は ESLint ルール + TypeScript strict mode + pre-commit hook で決定論的に検証する。

```
検出される問題の例:
  - any 型使用 → @typescript-eslint/no-explicit-any
  - 未使用変数 → @typescript-eslint/no-unused-vars
  - console.log 残存 → no-console
  - 空 catch → no-empty (pre-commit hook でも検出)
  - TODO/FIXME → pre-commit hook で検出
  - .skip/.only → pre-commit hook で検出
```

プロジェクト固有のルールは `.eslintrc` で定義し、CI で強制する。

---

## 2. 2-Step Review Model (#66)

> **v1.1.0 改訂**: Role A/B の AI 反復レビューループを廃止。
> 静的解析 pass + human/bot PR review (route 別 reviewer 構成) に移行。

### 2.1 基本思想

```
品質の担保は 2 ステップで完結する:

  Step 1: Dev Self-Review (実装者)
    - PR テンプレートの全フィールド記入
    - §1 のチェックリスト全 PASS 確認
    - スクリプトによる自動検証 (CI)

  Step 2: External Review (route label で reviewer 数・構成を決定)
    - route:fast-merge → lead-bot 1名
    - route:audit-required → lead-bot + auditor
    - route:ceo-approval → lead-bot + auditor + CEO
    - route label は diff 特性から route-classifier スクリプトが自動分類
```

### 2.2 Route Classification

PR の diff 特性から `route-classifier` スクリプトが自動分類:

| Route Label | 条件 | Reviewer |
|---|---|---|
| `route:fast-merge` | docs / test / lint / typo / 既存 feature 修正 | lead-bot |
| `route:audit-required` | 新機能追加 / リファクタリング / CI 変更 | lead-bot + auditor |
| `route:ceo-approval` | DB schema / API 公開仕様 / security / 新外部依存 | lead-bot + auditor + CEO |

### 2.3 レビュー基準

External reviewer は以下を確認:

```
1. PR description が変更の意図を正確に表現しているか
2. 1 PR 1 concern に適合しているか
3. 変更が SSOT の意図と一致しているか
4. 既存アーキテクチャと一貫しているか
5. 他モジュール/サービスに予期しない影響がないか
6. エッジケースが適切に考慮されているか
```

### 2.4 反復ルール

```
修正サイクル上限: 3回
  cycle 1: reviewer が全項目確認。BLOCKER/CRITICAL のみ修正要求
  cycle 2: 指摘者が修正 diff のみ確認。新しい指摘は追加しない
  cycle 3: 解決しなければ上位層に escalation

WARNING 以下は follow-up issue に記録、PR 内での修正は不要。
```

> **Note**: v1.0.0 の Adversarial Review (Role A/B AI 反復ループ、100点スコアリング) は廃止。
> 品質保証は §1 の決定論的チェック + 本セクションの 2-step review で担保する。

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

### 3.2 テスト3層（L1 / L2 / L3）

テストを3つの層に分類し、各層に目的・実行環境・実行タイミング・必須基準を定義する。

| 層 | 内容 | 実行環境 | 実行タイミング | 必須基準 |
|---|---|---|---|---|
| L1: Unit | ロジックテスト（モックOK） | ローカル | コミット時・CI | PASS率100%、カバレッジ80%+ |
| L2: Integration | 実DB接続でのAPIテスト | テスト用DB（ローカルまたはCI） | PR時・CI | PASS率100% |
| L3: E2E/Browser | ブラウザでの画面操作テスト | staging環境 + browser-use | デプロイ後 | 主要フロー全通過 |

#### L1: Unit
- 関数・ユーティリティの正確性を保証
- モック使用OK（外部API、DB接続等）
- コミット時にpre-commitおよびCIで実行
- ツール: project.jsonのtesting.l1.toolを参照（§3.6参照）

#### L2: Integration
- 実際のデータベースに接続してAPIテスト
- マイグレーション適用 → シードデータ投入 → APIリクエスト → レスポンス検証 → クリーンアップ
- テスト対象:
  - 全APIエンドポイントの正常系
  - 認証フロー（ログイン → セッション取得 → 認証済みリクエスト）
  - CRUD全操作（Create → Read → Update → Delete）
  - DB制約違反時のエラーハンドリング
- ツール: project.jsonのtesting.l2を参照（§3.6参照）

#### L3: E2E/Browser
- browser-useまたはPlaywrightでブラウザ操作テスト
- テスト対象:
  - ログイン画面表示 → ログイン操作 → ダッシュボード遷移
  - 全ページの表示確認（403/404/500が出ないこと）
  - 主要CRUD操作のUI動作
  - エラーページの表示
- 失敗時はスクリーンショットを保存して報告
- ツール: project.jsonのtesting.l3を参照（§3.6参照）

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

**統合テスト（L2）**:
- 実際のDB（テスト用）を使用
- テスト前にDBクリーン → シードデータ投入
- 各テスト後にトランザクションロールバック
- 全エンドポイントの正常系+異常系（400/401/403/404/500）
- **実行環境**: CI上のサービスコンテナ（PostgreSQL等）またはローカルのテスト用DB
- **実行タイミング**: PR作成時のCIで必須実行
- **該当しない場合**: プロジェクトにAPIエンドポイントがない場合（cli, lpプロファイル等）はスキップ可

**E2Eテスト（L3）**:
- Page Object Model パターンを使用
- テストデータはAPI経由でセットアップ
- スクリーンショットを各ステップで取得
- CI環境でのヘッドレス実行を前提
- **実行環境**: staging環境 + browser-use（または同等のブラウザ自動化ツール）
- **実行タイミング**: stagingデプロイ後に実行
- **該当しない場合**: UIを持たないプロジェクト（api, cliプロファイル等）はスキップ可

### 3.5 テスト品質スコアカード（100点満点・合格=100点）

| # | カテゴリ | 配点 | 評価基準 |
|---|---------|------|---------|
| 1 | SSOT網羅性 | 25 | §10の全テストケースが実装されているか |
| 2 | テスト実行結果 | 20 | 全テストがパスするか（1件失敗=0点） |
| 3 | L1カバレッジ | 10 | 90%+=10, 80-89%=7, 70-79%=3, <70%=0 |
| 4 | L2カバレッジ | 15 | APIエンドポイントの実DBテスト率。100%=15, 80%+=10, 60%+=5, <60%=0 |
| 5 | L3カバレッジ | 10 | 主要フローのブラウザテスト率。100%=10, 80%+=7, 50%+=3, <50%=0 |
| 6 | テスト品質 | 10 | 独立性(3) + 命名の明確さ(3) + AAA(4) |
| 7 | エッジケース | 5 | 境界値(2) + 空データ(1) + エラーケース(2) |
| 8 | テスト保守性 | 5 | ファクトリ(2) + ヘルパー(2) + データ管理(1) |

#### L1のみ実装時のスコア上限

L2/L3が未実装の場合、テスト品質スコアに上限を設ける:

| テスト層の実装状況 | スコア上限 |
|---|---|
| L1のみ | **70点** |
| L1 + L2 | **90点** |
| L1 + L2 + L3 | 100点（上限なし） |

※ L2/L3が該当しないプロファイル（cli, lpなど）では、該当層をスキップ扱いとし上限は適用しない。
該当有無はproject.jsonのtesting設定で判定する。

### 3.6 テストツールの動的参照

テストツールはプロジェクトごとに異なるため、固定ツールリストではなくproject.jsonのtestingセクションから動的に参照する。

#### project.jsonのtesting設定

```json
{
  "testing": {
    "l1": { "tool": "vitest", "autoDetected": true },
    "l2": { "tool": "vitest", "database": "docker-postgres", "autoDetected": false, "userApproved": true },
    "l3": { "tool": "browser-use", "autoDetected": false, "userApproved": true }
  }
}
```

#### 設定の決定方法

1. **framework init/retrofit 時**: スタック検出に基づきデフォルト値を提案
2. **ユーザー承認**: 提案された設定をユーザーが確認・変更
3. **project.jsonに保存**: Gateチェック・監査で参照

#### スタック別のデフォルト推薦

| 種別 | 検出スタック | L1 | L2 | L3 |
|---|---|---|---|---|
| Webアプリ | Nuxt3 + PostgreSQL | vitest | vitest + docker-postgres | browser-use |
| Webアプリ | Next.js + Supabase | jest or vitest | vitest + supabase-test | browser-use |
| Webアプリ | FastAPI + PostgreSQL | pytest | pytest + docker-postgres | browser-use |
| CLIツール | Node.js | vitest | vitest + docker-postgres（該当時） | なし |
| スクリプト | ts-node | vitest | なし | なし |
| モバイル | React Native | jest | 実機/エミュレータAPIテスト | detox or maestro |

#### Gateチェックとの連携

- Gate C（SSOT完全性）のチェック時、project.jsonのtesting設定を参照
- testing設定が未定義の場合、Gate Cでは警告のみ（ブロックしない）
- L2/L3の設定があるのにテストファイルが存在しない場合、監査で減点対象

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

### 4.7 Gate D — Post-Deploy Verification（ADR-009改訂）

デプロイ後に実環境で動作を検証するGate。
Gate A/B/Cが「コードの品質」を担保するのに対し、Gate Dは「デプロイされた環境の動作」を担保する。

#### Gate D チェック項目

| チェック | 内容 | 判定方法 |
|---|---|---|
| D-1: ヘルスチェック | /api/health が200を返す | curl/fetch |
| D-2: SSL/TLS | 証明書が有効 | curl --ssl |
| D-3: 主要ページ表示 | トップ・ログイン等が200を返す | browser-use open + state |
| D-4: E2Eスモークテスト | 主要フロー（ログイン→ダッシュボード等）が動作 | browser-use（L3テスト） |
| D-5: エラー監視 | コンソールに重大エラーがないこと | browser-use eval |

#### 実行タイミング

- Staging/Productionへのデプロイ完了後に自動実行
- CIパイプラインのデプロイジョブの最終ステップとして組み込む
- 失敗時：決定論的エスカレーションポリシー (#62) に基づき自動対応:
  - D-1/D-2 FAIL → auto-rollback (Critical — 人間判断不要)
  - D-3 FAIL → alert + 15min grace → auto-rollback (High)
  - D-4 FAIL → follow-up Issue 作成 (Medium)
  - D-5 FAIL → log only (Low)
- Bypass は CEO token 必須 (→ 09_ENFORCEMENT §2)

#### Gate DとL3テストの関係

- ADR-010のL3（E2E/Browser）テストがGate Dの実体
- L3テストが定義されていないプロジェクトはGate D未通過
- Gate D導入により、L3テストの作成がデプロイの前提条件になる

#### 段階的導入

| Phase | 必須チェック | 条件 |
|---|---|---|
| Phase 1 | D-1（ヘルスチェック）+ D-3（ページ表示） | 即時適用 |
| Phase 2 | + D-4（E2Eスモークテスト） | ADR-010 Phase 2完了後 |
| Phase 3 | 全項目（D-1〜D-5） | 全プロジェクトL3テスト完備後 |

#### .framework/gates.json のGate Dスキーマ

Gate Dのステータスは `.framework/gates.json` に他のGateと同様に管理する。

```json
{
  "gateA": { "status": "passed", "checks": [...], "checkedAt": "..." },
  "gateB": { "status": "passed", "checks": [...], "checkedAt": "..." },
  "gateC": { "status": "passed", "checks": [...], "checkedAt": "..." },
  "gateD": {
    "status": "passed | failed | pending | skipped",
    "environment": "staging | production",
    "checks": [
      { "id": "D-1", "name": "Health Check", "passed": true, "url": "/api/health", "statusCode": 200, "message": "OK" },
      { "id": "D-2", "name": "SSL/TLS", "passed": true, "message": "Certificate valid until 2027-01-01" },
      { "id": "D-3", "name": "Page Display", "passed": true, "pages": ["/", "/login"], "message": "All pages returned 200" },
      { "id": "D-4", "name": "E2E Smoke", "passed": false, "message": "Login flow failed", "screenshot": ".framework/screenshots/d4-failure.png" },
      { "id": "D-5", "name": "Error Monitor", "passed": true, "message": "No console errors" }
    ],
    "checkedAt": "2026-03-24T00:00:00Z",
    "deployedAt": "2026-03-24T00:00:00Z",
    "deployCommit": "abc1234"
  },
  "updatedAt": "..."
}
```

- `status`: `"passed"` = 全チェック通過、`"failed"` = いずれか失敗、`"pending"` = 未実行、`"skipped"` = 該当なし（CLIプロジェクト等）
- `environment`: 検証対象の環境
- `checks`: 各チェック項目の結果（screenshot付き可）
- Gate A/B/Cの既存スキーマとの互換性を維持
- Gate D は pre-commit / CI/PR の Gate チェックには含めない（Post-Deploy 専用）

#### Gateシステム全体像

> **v1.1.0 改訂** (#62): Gate A/B/C は GitHub Actions check runs で管理。
> `.framework/gates.json` は local cache (pre-commit hook 用) で、SSOT ではない。

| Gate | 目的 | 実行タイミング | 強制方法 |
|---|---|---|---|
| A（Environment） | 環境が壊れた状態でコードを書かせない | **PR check run** + pre-commit hook | `gate-a.yml` + branch protection |
| B（Planning） | 計画なしに場当たり的な実装をさせない | **PR check run** + pre-commit hook | `gate-b.yml` + branch protection |
| C（SSOT） | 仕様未承認のままコードを書かせない | **PR check run** + pre-commit hook | `gate-c.yml` + branch protection |
| D（Post-Deploy） | デプロイされた環境の動作を検証 | デプロイ後 | CI デプロイジョブ |

#### Branch Protection 設定手順 (adopter 向け)

Gate A/B/C を PR merge の必須条件にするには:

```
1. GitHub repo Settings → Branches → Branch protection rules
2. main ブランチのルールを編集 (または新規作成)
3. "Require status checks to pass before merging" を有効化
4. 以下の check を required に追加:
   - "Gate A — Environment Readiness"
   - "Gate B — Planning Completeness"
   - "Gate C — SSOT Completeness"
5. Save changes
```

> **Note**: `framework gate reset` は廃止されました (#62)。
> Gate の再実行は新しいコミットの push、または GitHub Actions の workflow re-run で行います。

---

## 5. PR レビュー基準 (#66)

> **v1.1.0 改訂**: 2-Step Review Model (§2) に基づくレビューフロー。

### 5.1 PR作成チェックリスト（Step 1: Dev Self-Review）

```
□ CI が全てグリーン (§1 チェックリスト全 PASS)
□ PR テンプレートが全て記入済み
□ SSOT 準拠チェックが全て完了 (MUST 要件)
□ 変更に対応するテストが追加済み
□ スクリーンショット添付（UI 変更の場合）
□ 関連 Issue がリンク済み
□ route label が付与済み (route-classifier による自動分類)
```

### 5.2 レビュー観点（Step 2: External Reviewer）

§2.3 の 6 項目チェックリスト (pass/fail):

| # | 観点 | チェック内容 |
|---|------|-------------|
| 1 | PR description | 変更の意図を正確に表現しているか |
| 2 | Scope | 1 PR 1 concern に適合しているか |
| 3 | SSOT 準拠 | 変更が SSOT の意図と一致しているか |
| 4 | アーキテクチャ整合 | 既存アーキテクチャと一貫しているか |
| 5 | 影響分析 | 他モジュール/サービスに予期しない影響がないか |
| 6 | エッジケース | 適切に考慮されているか |

### 5.3 マージフロー

```
Dev Self-Review → CI green → route label 付与
  → External Reviewer アサイン (route 別)
  → Reviewer LGTM → Squash & Merge
  → main CI（全テスト再実行 + Staging 自動デプロイ）
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
| 1 | SSOT網羅性 | 25 | /25 | |
| 2 | テスト実行結果 | 20 | /20 | |
| 3 | L1カバレッジ | 10 | /10 | |
| 4 | L2カバレッジ | 15 | /15 | |
| 5 | L3カバレッジ | 10 | /10 | |
| 6 | テスト品質 | 10 | /10 | |
| 7 | エッジケース | 5 | /5 | |
| 8 | テスト保守性 | 5 | /5 | |
| **合計** | | **100** | **/100** | |

## テスト層カバレッジ詳細
| 層 | ツール | テスト数 | PASS | FAIL | カバレッジ率 |
|---|---|---|---|---|---|
| L1: Unit | [project.jsonから] | | | | XX% |
| L2: Integration | [project.jsonから] | | | | XX% (エンドポイント数ベース) |
| L3: E2E/Browser | [project.jsonから] | | | | XX% (主要フロー数ベース) |

## スコア上限適用
- テスト層の実装状況: [L1のみ / L1+L2 / L1+L2+L3]
- 上限適用: [あり(XX点) / なし]
- 最終スコア: /100
```

---

## 変更履歴

| 日付 | 変更内容 |
|------|---------|
| 2026-02-14 | 初版作成（17_CODE_AUDIT + 18_TEST_FORMAT + 19_CI_PR_STANDARDS を統合） |
| 2026-03-23 | ADR-010に基づきテスト3層化（L1/L2/L3）を導入。ツール動的参照、スコアカードにL2/L3カバレッジ追加、減点下限保証規定 |
| 2026-03-24 | ADR-009改訂に基づきGate D（Post-Deploy Verification）を追加。チェック項目D-1〜D-5、段階的導入Phase 1-3、gates.jsonスキーマ定義 |
| 2026-04-17 | v1.1.0 — epic #60 方針反映: §1 AI スコアリング→決定論的チェックリスト (#62)、§2 Adversarial Review→2-Step Review Model (#66)、§4.7 CTO 判断→決定論的エスカレーション (#62)、§5 4-layer chain→2-step review (#66) |
