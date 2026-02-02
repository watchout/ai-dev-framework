# SSOT-3: 契約台帳（API / Event / Error）

> API入出力、エラーコード、権限、監査ログ方針を定義

---

## 1. API設計方針

### 1.1 基本ルール

| 項目 | 方針 |
|------|------|
| ベースURL | `/api/v1` |
| 認証 | Bearer Token（JWT） |
| フォーマット | JSON |
| 日時 | ISO 8601（UTC） |
| ページネーション | `?page=1&limit=20` |
| ソート | `?sort=created_at&order=desc` |
| フィルタ | `?status=active&type=user` |

### 1.2 HTTPメソッド使い分け

| メソッド | 用途 | 冪等性 |
|---------|------|-------|
| GET | リソース取得 | ✅ |
| POST | リソース作成 | ❌ |
| PUT | リソース全体更新 | ✅ |
| PATCH | リソース部分更新 | ❌ |
| DELETE | リソース削除 | ✅ |

---

## 2. 認証API（AUTH）

### 2.1 POST /api/v1/auth/login

**説明**: メール/パスワードでログイン

**認証**: 不要

**リクエスト**:
```json
{
  "email": "user@example.com",
  "password": "password123"
}
```

**レスポンス（成功）**: `200 OK`
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIs...",
  "refresh_token": "eyJhbGciOiJIUzI1NiIs...",
  "token_type": "Bearer",
  "expires_in": 3600,
  "user": {
    "id": "usr_123",
    "email": "user@example.com",
    "name": "John Doe",
    "role": "user"
  }
}
```

**エラー**:
| コード | 条件 | メッセージ |
|-------|------|-----------|
| 400 | バリデーションエラー | "Invalid email format" |
| 401 | 認証失敗 | "Invalid credentials" |
| 423 | アカウントロック | "Account locked. Try again in 30 minutes" |
| 429 | レート制限 | "Too many attempts" |

---

### 2.2 POST /api/v1/auth/logout

**説明**: ログアウト

**認証**: 必要（Bearer Token）

**リクエスト**: なし

**レスポンス（成功）**: `204 No Content`

---

### 2.3 POST /api/v1/auth/refresh

**説明**: アクセストークン更新

**認証**: 不要（リフレッシュトークンを使用）

**リクエスト**:
```json
{
  "refresh_token": "eyJhbGciOiJIUzI1NiIs..."
}
```

**レスポンス（成功）**: `200 OK`
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIs...",
  "expires_in": 3600
}
```

**エラー**:
| コード | 条件 | メッセージ |
|-------|------|-----------|
| 401 | トークン無効/期限切れ | "Invalid refresh token" |

---

### 2.4 POST /api/v1/auth/forgot-password

**説明**: パスワードリセットメール送信

**認証**: 不要

**リクエスト**:
```json
{
  "email": "user@example.com"
}
```

**レスポンス（成功）**: `200 OK`
```json
{
  "message": "If the email exists, a reset link has been sent"
}
```

> **セキュリティ注意**: メールの存在有無を漏らさないため、常に同じメッセージを返す

---

### 2.5 POST /api/v1/auth/reset-password

**説明**: パスワードリセット実行

**認証**: 不要（トークンで認証）

**リクエスト**:
```json
{
  "token": "reset_token_xxx",
  "password": "new_password123",
  "password_confirmation": "new_password123"
}
```

**レスポンス（成功）**: `200 OK`
```json
{
  "message": "Password has been reset"
}
```

---

## 3. ユーザーAPI（USER）

### 3.1 GET /api/v1/users/me

**説明**: 現在のユーザー情報取得

**認証**: 必要

**レスポンス（成功）**: `200 OK`
```json
{
  "id": "usr_123",
  "email": "user@example.com",
  "name": "John Doe",
  "role": "user",
  "avatar_url": "https://...",
  "created_at": "2024-01-01T00:00:00Z",
  "updated_at": "2024-01-15T00:00:00Z"
}
```

---

### 3.2 PATCH /api/v1/users/me

**説明**: 現在のユーザー情報更新

**認証**: 必要

**リクエスト**:
```json
{
  "name": "John Smith",
  "avatar_url": "https://..."
}
```

**レスポンス（成功）**: `200 OK`（更新後のユーザー情報）

---

## 4. 汎用CRUD API テンプレート

### 4.1 GET /api/v1/{resource}

**説明**: リソース一覧取得

**クエリパラメータ**:
| パラメータ | 型 | デフォルト | 説明 |
|-----------|-----|----------|------|
| page | integer | 1 | ページ番号 |
| limit | integer | 20 | 1ページあたりの件数（最大100） |
| sort | string | created_at | ソートキー |
| order | string | desc | asc / desc |
| search | string | - | キーワード検索 |
| {filter} | string | - | フィルタ条件 |

**レスポンス（成功）**: `200 OK`
```json
{
  "data": [...],
  "pagination": {
    "current_page": 1,
    "total_pages": 10,
    "total_count": 195,
    "limit": 20,
    "has_next": true,
    "has_prev": false
  }
}
```

---

### 4.2 GET /api/v1/{resource}/{id}

**説明**: リソース詳細取得

**レスポンス（成功）**: `200 OK`
```json
{
  "id": "xxx_123",
  "...": "..."
}
```

---

### 4.3 POST /api/v1/{resource}

**説明**: リソース作成

**レスポンス（成功）**: `201 Created`
```json
{
  "id": "xxx_124",
  "...": "..."
}
```

---

### 4.4 PATCH /api/v1/{resource}/{id}

**説明**: リソース部分更新

**レスポンス（成功）**: `200 OK`（更新後のリソース）

---

### 4.5 DELETE /api/v1/{resource}/{id}

**説明**: リソース削除

**レスポンス（成功）**: `204 No Content`

---

## 5. エラーコード体系

### 5.1 HTTPステータスコード

| コード | 意味 | 用途 |
|-------|------|------|
| 200 | OK | 成功（データあり） |
| 201 | Created | 作成成功 |
| 204 | No Content | 成功（データなし） |
| 400 | Bad Request | リクエスト不正 |
| 401 | Unauthorized | 認証エラー |
| 403 | Forbidden | 権限エラー |
| 404 | Not Found | リソースなし |
| 409 | Conflict | 競合エラー |
| 422 | Unprocessable Entity | バリデーションエラー |
| 429 | Too Many Requests | レート制限 |
| 500 | Internal Server Error | サーバーエラー |

### 5.2 アプリケーションエラーコード

```json
{
  "error": {
    "code": "AUTH_001",
    "message": "Invalid credentials",
    "details": { ... }
  }
}
```

| コード | 意味 |
|-------|------|
| AUTH_001 | 認証失敗 |
| AUTH_002 | トークン期限切れ |
| AUTH_003 | トークン無効 |
| AUTH_004 | アカウントロック |
| AUTH_005 | アカウント無効化 |
| PERM_001 | 権限不足 |
| PERM_002 | リソースへのアクセス権なし |
| VAL_001 | バリデーションエラー |
| VAL_002 | 必須フィールド不足 |
| RES_001 | リソースが見つからない |
| RES_002 | リソース競合 |
| RATE_001 | レート制限超過 |
| SYS_001 | システムエラー |

### 5.3 バリデーションエラー詳細

```json
{
  "error": {
    "code": "VAL_001",
    "message": "Validation failed",
    "details": {
      "fields": {
        "email": ["Invalid email format"],
        "password": ["Must be at least 8 characters", "Must contain a number"]
      }
    }
  }
}
```

---

## 6. 権限マトリクス

### 6.1 ロール定義

| ロール | 説明 | 階層 |
|-------|------|------|
| guest | 未認証ユーザー | 0 |
| user | 一般ユーザー | 1 |
| admin | 管理者 | 2 |
| super_admin | スーパー管理者 | 3 |

### 6.2 エンドポイント別権限

| エンドポイント | guest | user | admin | super_admin |
|--------------|-------|------|-------|-------------|
| POST /auth/login | ✅ | - | - | - |
| GET /users/me | ❌ | ✅ | ✅ | ✅ |
| GET /users | ❌ | ❌ | ✅ | ✅ |
| DELETE /users/{id} | ❌ | ❌ | ❌ | ✅ |

---

## 7. レート制限

### 7.1 制限設定

| エンドポイント | 制限 | ウィンドウ |
|--------------|------|----------|
| POST /auth/login | 5回 | 15分 |
| POST /auth/forgot-password | 3回 | 1時間 |
| 一般API（認証済み） | 100回 | 1分 |
| 一般API（未認証） | 20回 | 1分 |

### 7.2 レスポンスヘッダー

```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1704067200
```

---

## 8. 監査ログ

### 8.1 記録対象アクション

| アクション | 記録レベル | 記録内容 |
|-----------|----------|---------|
| ログイン成功 | INFO | user_id, ip, user_agent |
| ログイン失敗 | WARN | email(masked), ip, reason |
| ログアウト | INFO | user_id |
| パスワード変更 | INFO | user_id |
| 権限変更 | WARN | target_user_id, old_role, new_role, changed_by |
| データ削除 | WARN | resource_type, resource_id, deleted_by |

### 8.2 ログフォーマット

```json
{
  "timestamp": "2024-01-15T10:30:00Z",
  "level": "INFO",
  "action": "user.login",
  "actor": {
    "id": "usr_123",
    "ip": "192.168.1.1",
    "user_agent": "Mozilla/5.0..."
  },
  "resource": {
    "type": "session",
    "id": "ses_456"
  },
  "result": "success",
  "metadata": { ... }
}
```

---

## 9. API実装チェックリスト

### 9.1 各エンドポイントで確認

- [ ] 入力バリデーション定義
- [ ] 出力スキーマ定義
- [ ] エラーケース列挙
- [ ] 認証要否の明示
- [ ] 必要な権限の明示
- [ ] レート制限の設定
- [ ] 監査ログの要否

### 9.2 共通実装確認

- [ ] 認証ミドルウェア
- [ ] 権限チェックミドルウェア
- [ ] エラーハンドリングミドルウェア
- [ ] レート制限ミドルウェア
- [ ] リクエストログ
- [ ] CORS設定

---

## 変更履歴

| 日付 | 変更内容 | 変更者 |
|------|---------|-------|
| | 初版作成 | |
