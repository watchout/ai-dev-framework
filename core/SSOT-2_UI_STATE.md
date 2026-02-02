# SSOT-2: 画面・状態台帳（UI Flow + State Machine）

> 画面遷移図だけでなく「状態遷移」を文章で固定する

---

## 1. 画面一覧（Screen List）

### 1.1 Public（認証不要）

| Screen ID | 画面名 | パス | 説明 | 関連機能ID |
|-----------|-------|------|------|-----------|
| SCR-LOGIN | ログイン | /login | | AUTH-001 |
| SCR-SIGNUP | サインアップ | /signup | | ACCT-001 |
| SCR-FORGOT-PW | パスワード忘れ | /forgot-password | | AUTH-006 |
| SCR-RESET-PW | パスワードリセット | /reset-password/:token | | AUTH-006 |
| SCR-VERIFY-EMAIL | メール認証 | /verify-email/:token | | AUTH-007 |
| SCR-LANDING | ランディング | / | | |
| SCR-PUBLIC-* | その他Public | /public/* | | |

### 1.2 Protected（認証必要・一般ユーザー）

| Screen ID | 画面名 | パス | 説明 | 関連機能ID |
|-----------|-------|------|------|-----------|
| SCR-DASHBOARD | ダッシュボード | /app | ログイン後のホーム | |
| SCR-PROFILE | プロフィール | /app/profile | | ACCT-002, ACCT-003 |
| SCR-SETTINGS | 設定 | /app/settings | | |
| SCR-* | その他Protected | /app/* | | |

### 1.3 Admin（管理者専用）

| Screen ID | 画面名 | パス | 説明 | 関連機能ID | 必要ロール |
|-----------|-------|------|------|-----------|----------|
| SCR-ADMIN-DASH | 管理者ダッシュボード | /admin | | OPS-001 | Admin |
| SCR-ADMIN-USERS | ユーザー管理 | /admin/users | | OPS-002 | Admin |
| SCR-ADMIN-* | その他Admin | /admin/* | | | Admin |

### 1.4 エラー画面

| Screen ID | 画面名 | パス | 説明 | 関連機能ID |
|-----------|-------|------|------|-----------|
| SCR-404 | Not Found | /404 | | ERR-001 |
| SCR-403 | Forbidden | /403 | | ERR-002 |
| SCR-500 | Server Error | /500 | | ERR-003 |

---

## 2. 認証状態（Authentication States）

### 2.1 状態定義

```
┌─────────────────────────────────────────────────────────────────┐
│                      認証状態マシン                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│    ┌──────────┐                          ┌──────────┐          │
│    │    S0    │───── login_success ────→ │    S1    │          │
│    │ 未ログイン │←──── logout ────────────│ログイン済み│          │
│    └──────────┘                          └──────────┘          │
│         ↑                                     │                │
│         │                              token_expired           │
│         │                                     ↓                │
│         │                               ┌──────────┐          │
│         └─────── refresh_failed ────────│    S2    │          │
│                                         │セッション切れ│          │
│                                         └──────────┘          │
│                                                                 │
│    ┌──────────┐                          ┌──────────┐          │
│    │    S3    │                          │    S4    │          │
│    │ 権限不足  │                          │アカウント停止│          │
│    └──────────┘                          └──────────┘          │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

| 状態ID | 状態名 | 説明 |
|--------|-------|------|
| **S0** | LOGGED_OUT | 未ログイン（セッションなし） |
| **S1** | LOGGED_IN | ログイン済み（有効なセッション） |
| **S2** | SESSION_EXPIRED | セッション期限切れ |
| **S3** | FORBIDDEN | 権限不足（認証済みだがアクセス権なし） |
| **S4** | ACCOUNT_DISABLED | アカウント停止/無効化 |

### 2.2 状態遷移表

| 現在の状態 | イベント | 次の状態 | アクション |
|-----------|---------|---------|-----------|
| S0 | login_submit | (処理中) | API呼び出し |
| S0 | login_success | S1 | /app へ遷移（nextパラメータあれば優先） |
| S0 | login_failure | S0 | エラーメッセージ表示 |
| S1 | logout | S0 | セッション破棄 → /login へ遷移 |
| S1 | token_expired | S2 | トークン更新を1回試行 |
| S2 | refresh_success | S1 | 元ページ継続 |
| S2 | refresh_failed | S0 | /login?reason=expired&next=<original> へ遷移 |
| S1 | access_forbidden | S3 | /403 または /app?toast=forbidden |
| S1 | account_disabled | S4 | /login?reason=disabled へ遷移 |
| * | 401_response | S2 | 自動リフレッシュ試行 |
| * | 403_response | S3 | エラー表示またはリダイレクト |

---

## 3. ルート保護（Route Guards）

### 3.1 ルートカテゴリ定義

```typescript
// 例: Next.js / React Router での実装イメージ

type RouteCategory = 'public' | 'protected' | 'admin';

const routeConfig = {
  // Public: 誰でもアクセス可能
  public: [
    '/login',
    '/signup',
    '/forgot-password',
    '/reset-password/*',
    '/verify-email/*',
    '/public/*',
    '/',
  ],
  
  // Protected: 認証必要
  protected: [
    '/app',
    '/app/*',
  ],
  
  // Admin: 認証 + 管理者ロール必要
  admin: [
    '/admin',
    '/admin/*',
  ],
};
```

### 3.2 ルートガードルール

#### Rule 1: 未認証で Protected/Admin にアクセス

```
条件: state === S0 && route in (protected | admin)
動作: 
  1. 現在のURLを next パラメータに保存
  2. /login?next=<encoded_url> へリダイレクト
```

#### Rule 2: 認証済みで Login/Signup にアクセス

```
条件: state === S1 && route in ('/login', '/signup')
動作: 
  1. /app へリダイレクト（すでにログイン済み）
```

#### Rule 3: 非管理者で Admin にアクセス

```
条件: state === S1 && role !== 'admin' && route in admin
動作: 
  1. /403 へリダイレクト
  または
  2. /app?toast=forbidden へリダイレクト
```

#### Rule 4: セッション期限切れ検知時

```
条件: API呼び出しで 401 Unauthorized を受信
動作:
  1. リフレッシュトークンがあれば自動更新を試行
  2. 成功: 元のリクエストを再実行
  3. 失敗: /login?reason=expired&next=<current_url> へリダイレクト
```

#### Rule 5: アカウント停止検知時

```
条件: API呼び出しで account_disabled エラーを受信
動作:
  1. ローカルセッションをクリア
  2. /login?reason=disabled へリダイレクト
  3. 「アカウントが無効化されています」メッセージ表示
```

---

## 4. 画面遷移図

### 4.1 認証フロー

```
                                    ┌─────────────┐
                                    │   Landing   │
                                    │     /       │
                                    └──────┬──────┘
                                           │
                                    ┌──────▼──────┐
                                    │    Login    │
                                    │   /login    │
                                    └──────┬──────┘
                                           │
                    ┌──────────────────────┼──────────────────────┐
                    │                      │                      │
             ┌──────▼──────┐        ┌──────▼──────┐        ┌──────▼──────┐
             │   Signup    │        │  Dashboard  │        │  Forgot PW  │
             │  /signup    │        │    /app     │        │/forgot-pass │
             └──────┬──────┘        └─────────────┘        └──────┬──────┘
                    │                                             │
             ┌──────▼──────┐                               ┌──────▼──────┐
             │ Verify Email│                               │  Reset PW   │
             │/verify-email│                               │ /reset-pass │
             └─────────────┘                               └─────────────┘
```

### 4.2 メインアプリフロー

```
                              ┌─────────────┐
                              │  Dashboard  │
                              │    /app     │
                              └──────┬──────┘
                                     │
          ┌──────────────────────────┼──────────────────────────┐
          │                          │                          │
   ┌──────▼──────┐           ┌──────▼──────┐           ┌──────▼──────┐
   │   Profile   │           │  Settings   │           │  Feature X  │
   │/app/profile │           │/app/settings│           │ /app/xxx    │
   └─────────────┘           └─────────────┘           └─────────────┘
```

---

## 5. URLパラメータ仕様

### 5.1 認証関連パラメータ

| パラメータ | 用途 | 例 |
|-----------|------|-----|
| `next` | ログイン後のリダイレクト先 | /login?next=/app/settings |
| `reason` | リダイレクト理由 | /login?reason=expired |
| `toast` | 表示するメッセージ種別 | /app?toast=forbidden |

### 5.2 reason パラメータ値

| 値 | 意味 | 表示メッセージ例 |
|----|------|----------------|
| `expired` | セッション期限切れ | 「セッションが切れました。再度ログインしてください」 |
| `disabled` | アカウント無効化 | 「アカウントが無効化されています」 |
| `logout` | ログアウト完了 | 「ログアウトしました」 |

---

## 6. コンポーネント状態

### 6.1 ローディング状態

| 状態 | 表示 | トリガー |
|------|------|---------|
| `idle` | 通常表示 | 初期状態 |
| `loading` | スピナー/スケルトン | API呼び出し開始 |
| `success` | データ表示 | API成功 |
| `error` | エラーメッセージ | API失敗 |

### 6.2 フォーム状態

| 状態 | Submit ボタン | トリガー |
|------|-------------|---------|
| `idle` | 有効 | 初期状態 |
| `validating` | 有効 | 入力中 |
| `invalid` | 無効 | バリデーションエラー |
| `submitting` | 無効（ローディング） | 送信中 |
| `submitted` | 無効 | 送信完了 |

---

## 7. エラーハンドリングフロー

### 7.1 APIエラー時の遷移

| HTTPステータス | 意味 | アクション |
|--------------|------|-----------|
| 400 | Bad Request | フォームにエラー表示 |
| 401 | Unauthorized | リフレッシュ試行 → 失敗でログイン画面 |
| 403 | Forbidden | 403ページまたはトースト |
| 404 | Not Found | 404ページ |
| 422 | Validation Error | フォームに詳細エラー表示 |
| 429 | Too Many Requests | レート制限メッセージ |
| 500 | Server Error | 500ページまたはリトライ提案 |

### 7.2 ネットワークエラー時

```
検知: fetch失敗 / timeout
動作:
  1. 「ネットワークエラーが発生しました」トースト表示
  2. リトライボタン表示（またはN秒後に自動リトライ）
  3. オフライン状態なら「オフラインです」表示
```

---

## 8. 実装チェックリスト

### 8.1 ルートガード実装

- [ ] 未認証 → Protected へのアクセスブロック
- [ ] 認証済み → Login/Signup のリダイレクト
- [ ] 非管理者 → Admin へのアクセスブロック
- [ ] next パラメータによるリダイレクト復帰
- [ ] reason パラメータによるメッセージ表示

### 8.2 セッション管理実装

- [ ] トークン有効期限チェック
- [ ] 自動リフレッシュ機構
- [ ] リフレッシュ失敗時のログアウト処理
- [ ] 401レスポンス時のインターセプト

### 8.3 エラーハンドリング実装

- [ ] グローバルエラーバウンダリ
- [ ] APIエラーの共通処理
- [ ] エラーページ（404, 403, 500）
- [ ] トースト通知システム

---

## 変更履歴

| 日付 | 変更内容 | 変更者 |
|------|---------|-------|
| | 初版作成 | |
