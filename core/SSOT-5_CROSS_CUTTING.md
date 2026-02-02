# SSOT-5: 横断的関心事（Cross-Cutting Concerns）

> 全機能で共通する技術的ルール・方針を定義

---

## 1. 認証・認可

### 1.1 認証方式

| 方式 | 用途 | 有効期限 |
|------|------|---------|
| JWT（アクセストークン） | API認証 | 1時間 |
| JWT（リフレッシュトークン） | トークン更新 | 30日（remember_me時）/ 24時間 |
| セッションCookie | ブラウザセッション | トークンと同期 |

### 1.2 トークン構造

**アクセストークン（JWT）ペイロード**:
```json
{
  "sub": "usr_abc123",        // ユーザーID
  "email": "user@example.com",
  "role": "user",
  "iat": 1704067200,          // 発行時刻
  "exp": 1704070800           // 有効期限
}
```

**リフレッシュトークン**:
- DBに保存（sessionsテーブル）
- ハッシュ化して保存

### 1.3 認証フロー

```
1. ログイン成功
   → アクセストークン + リフレッシュトークン発行
   → リフレッシュトークンをDB保存
   → Cookieにトークン設定

2. API呼び出し
   → Authorizationヘッダーからアクセストークン取得
   → JWT検証（署名、有効期限）
   → ユーザー情報をリクエストコンテキストに設定

3. トークン期限切れ
   → 401 Unauthorized返却
   → フロントエンドがリフレッシュAPI呼び出し
   → 新しいアクセストークン発行

4. リフレッシュトークン期限切れ
   → 401 Unauthorized返却
   → フロントエンドがログイン画面へリダイレクト
```

### 1.4 認可（権限チェック）

**ロール階層**:
```
super_admin > admin > user > guest
```

**権限チェック実装**:
```typescript
// ミドルウェアで実装
function requireRole(minRole: Role) {
  return (req, res, next) => {
    if (req.user.roleLevel < minRole.level) {
      return res.status(403).json({
        error: { code: "PERM_001", message: "Insufficient permissions" }
      });
    }
    next();
  };
}
```

### 1.5 セッション管理ルール

| ルール | 設定値 |
|-------|-------|
| 同時セッション数上限 | 3 |
| アイドルタイムアウト | 30分（操作なし） |
| 絶対タイムアウト | 24時間 / 30日（remember_me） |
| セッション無効化 | ログアウト時、パスワード変更時 |

---

## 2. エラーハンドリング

### 2.1 エラーレスポンス形式（必須）

全てのAPIエラーは以下の形式で返却：

```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Human readable message",
    "details": { ... }  // オプション
  }
}
```

### 2.2 エラーコード体系

| プレフィックス | 意味 | HTTPステータス |
|--------------|------|--------------|
| AUTH_xxx | 認証エラー | 401, 423 |
| PERM_xxx | 権限エラー | 403 |
| VAL_xxx | バリデーションエラー | 400, 422 |
| RES_xxx | リソースエラー | 404, 409 |
| RATE_xxx | レート制限 | 429 |
| SYS_xxx | システムエラー | 500, 503 |

### 2.3 標準エラーコード一覧

| コード | HTTPステータス | 意味 | メッセージ例 |
|-------|--------------|------|------------|
| AUTH_001 | 401 | 認証失敗 | "Invalid credentials" |
| AUTH_002 | 401 | トークン期限切れ | "Token expired" |
| AUTH_003 | 401 | トークン無効 | "Invalid token" |
| AUTH_004 | 423 | アカウントロック | "Account locked" |
| AUTH_005 | 401 | アカウント無効 | "Account disabled" |
| PERM_001 | 403 | 権限不足 | "Insufficient permissions" |
| PERM_002 | 403 | リソースアクセス不可 | "Access denied to this resource" |
| VAL_001 | 400 | バリデーションエラー | "Validation failed" |
| VAL_002 | 400 | 必須フィールド不足 | "Required field missing" |
| RES_001 | 404 | リソースなし | "Resource not found" |
| RES_002 | 409 | リソース競合 | "Resource already exists" |
| RES_003 | 409 | 楽観的ロック失敗 | "Resource was modified" |
| RATE_001 | 429 | レート制限 | "Too many requests" |
| SYS_001 | 500 | システムエラー | "Internal server error" |
| SYS_002 | 503 | サービス利用不可 | "Service unavailable" |

### 2.4 バリデーションエラー詳細

```json
{
  "error": {
    "code": "VAL_001",
    "message": "Validation failed",
    "details": {
      "fields": {
        "email": ["Invalid email format", "Email already taken"],
        "password": ["Must be at least 8 characters"]
      }
    }
  }
}
```

### 2.5 フロントエンドエラー表示ルール

| エラー種別 | 表示方法 | 表示位置 |
|-----------|---------|---------|
| フィールドバリデーション | インライン | フィールド直下 |
| フォームエラー | バナー | フォーム上部 |
| グローバルエラー | トースト | 画面右上 |
| 致命的エラー | エラーページ | 全画面 |

### 2.6 エラーページ

| HTTPステータス | ページ | 内容 |
|--------------|-------|------|
| 400 | - | フォームにエラー表示 |
| 401 | /login | ログイン画面へリダイレクト |
| 403 | /403 | アクセス権限がありません |
| 404 | /404 | ページが見つかりません |
| 500 | /500 | システムエラー + サポート連絡先 |
| 503 | /maintenance | メンテナンス中 |

---

## 3. ログ出力

### 3.1 ログレベル

| レベル | 用途 | 本番環境 |
|-------|------|---------|
| DEBUG | デバッグ情報 | 出力しない |
| INFO | 正常な操作記録 | 出力する |
| WARN | 警告（異常だが継続可能） | 出力する |
| ERROR | エラー（処理失敗） | 出力する |
| FATAL | 致命的エラー | 出力する |

### 3.2 ログフォーマット（JSON）

```json
{
  "timestamp": "2024-01-15T10:30:00.000Z",
  "level": "INFO",
  "message": "User logged in",
  "service": "api",
  "traceId": "abc123",
  "spanId": "def456",
  "userId": "usr_abc123",
  "action": "auth.login",
  "duration": 150,
  "metadata": {
    "ip": "192.168.1.1",
    "userAgent": "Mozilla/5.0..."
  }
}
```

### 3.3 機密情報のマスキング（必須）

| データ種別 | マスキング方法 | 例 |
|-----------|--------------|-----|
| パスワード | 出力しない | - |
| メールアドレス | 部分マスク | u***@example.com |
| 電話番号 | 部分マスク | ***-****-1234 |
| クレジットカード | 末尾4桁のみ | ****-****-****-1234 |
| APIキー | 先頭4文字のみ | sk-a***... |
| トークン | 出力しない | - |

### 3.4 監査ログ（必須記録対象）

| アクション | ログレベル | 記録内容 |
|-----------|----------|---------|
| ログイン成功 | INFO | user_id, ip, user_agent |
| ログイン失敗 | WARN | email(masked), ip, reason |
| ログアウト | INFO | user_id |
| パスワード変更 | INFO | user_id |
| 権限変更 | WARN | target_user, old_role, new_role, changed_by |
| データ作成 | INFO | resource_type, resource_id, created_by |
| データ更新 | INFO | resource_type, resource_id, changed_fields, updated_by |
| データ削除 | WARN | resource_type, resource_id, deleted_by |
| 管理者操作 | WARN | action, target, admin_id |

---

## 4. セキュリティ

### 4.1 入力バリデーション

| 対象 | ルール |
|------|-------|
| 全入力 | 型チェック、長さ制限 |
| 文字列 | HTMLエスケープ、SQLエスケープ |
| ファイル | MIME検証、サイズ制限、拡張子チェック |
| URL | プロトコル検証（http/https のみ） |
| 数値 | 範囲チェック |

### 4.2 出力エンコーディング

| 出力先 | 対策 |
|-------|------|
| HTML | HTMLエスケープ |
| JSON | JSONエスケープ |
| URL | URLエンコード |
| JavaScript | JavaScriptエスケープ |

### 4.3 HTTPセキュリティヘッダー

```
Content-Security-Policy: default-src 'self'
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
X-XSS-Protection: 1; mode=block
Strict-Transport-Security: max-age=31536000; includeSubDomains
Referrer-Policy: strict-origin-when-cross-origin
```

### 4.4 CORS設定

```javascript
{
  origin: ['https://app.example.com'],
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
  maxAge: 86400
}
```

### 4.5 レート制限

| エンドポイント | 制限 | ウィンドウ |
|--------------|------|----------|
| POST /auth/login | 5回 | 15分 |
| POST /auth/forgot-password | 3回 | 1時間 |
| POST /auth/signup | 3回 | 1時間 |
| 認証済みAPI | 100回 | 1分 |
| 未認証API | 20回 | 1分 |

### 4.6 暗号化

| データ | 方式 | 備考 |
|-------|------|------|
| パスワード | bcrypt (cost=12) | ハッシュ化 |
| 機密データ（DB保存） | AES-256-GCM | 暗号化 |
| 通信 | TLS 1.3 | HTTPS必須 |
| セッションID | UUID v4 | 推測不可能 |

---

## 5. 国際化（i18n）

### 5.1 言語設定

| 優先順位 | ソース |
|---------|-------|
| 1 | ユーザー設定 |
| 2 | Accept-Language ヘッダー |
| 3 | デフォルト（ja） |

### 5.2 対応言語

| 言語コード | 言語 | 状態 |
|-----------|------|------|
| ja | 日本語 | デフォルト |
| en | 英語 | 対応予定 |

### 5.3 翻訳キー命名規則

```
{画面}.{コンポーネント}.{要素}

例:
login.form.email_label
login.form.submit_button
login.error.invalid_credentials
common.button.cancel
common.error.network_error
```

---

## 6. パフォーマンス

### 6.1 API応答時間目標

| 種別 | p50 | p95 | p99 |
|------|-----|-----|-----|
| 認証API | < 200ms | < 500ms | < 1s |
| 読み取りAPI | < 100ms | < 300ms | < 500ms |
| 書き込みAPI | < 200ms | < 500ms | < 1s |
| 検索API | < 300ms | < 1s | < 2s |

### 6.2 フロントエンド目標

| 指標 | 目標 |
|------|------|
| LCP (Largest Contentful Paint) | < 2.5s |
| FID (First Input Delay) | < 100ms |
| CLS (Cumulative Layout Shift) | < 0.1 |
| TTI (Time to Interactive) | < 3.5s |

### 6.3 キャッシュ戦略

| データ種別 | キャッシュ | TTL |
|-----------|----------|-----|
| 静的アセット | CDN + ブラウザ | 1年 |
| ユーザーデータ | なし | - |
| マスターデータ | Redis | 1時間 |
| 検索結果 | Redis | 5分 |

---

## 7. モニタリング・アラート

### 7.1 メトリクス

| メトリクス | 収集間隔 |
|-----------|---------|
| API応答時間 | リアルタイム |
| エラー率 | リアルタイム |
| CPU/メモリ使用率 | 1分 |
| DB接続数 | 1分 |
| キャッシュヒット率 | 1分 |

### 7.2 アラート条件

| 条件 | 重要度 | 通知先 |
|------|-------|-------|
| エラー率 > 5% (5分間) | Critical | Slack + PagerDuty |
| API応答時間 p95 > 2s | Warning | Slack |
| CPU使用率 > 80% (10分間) | Warning | Slack |
| DB接続数 > 80% | Warning | Slack |
| 5xx エラー発生 | Info | Slack |

---

## 8. 環境設定

### 8.1 環境変数命名規則

```
{サービス}_{カテゴリ}_{項目}

例:
APP_ENV=production
APP_DEBUG=false
DB_HOST=localhost
DB_PORT=5432
AUTH_JWT_SECRET=xxx
AUTH_JWT_EXPIRES_IN=3600
REDIS_URL=redis://localhost:6379
```

### 8.2 機密情報管理

| 環境 | 管理方法 |
|------|---------|
| 開発 | .env ファイル（.gitignore） |
| ステージング | Secrets Manager |
| 本番 | Secrets Manager |

---

## 変更履歴

| 日付 | 変更内容 | 変更者 |
|------|---------|-------|
| | 初版作成 | |
