# SSOT-4: データ台帳（DB / 整合性）

> エンティティ、主キー、制約、参照整合性、論理削除方針を定義

---

## 1. データベース設計方針

### 1.1 基本ルール

| 項目 | 方針 |
|------|------|
| 主キー | UUID（`xxx_`プレフィックス付き） |
| 命名規則 | snake_case |
| タイムスタンプ | UTC、ISO 8601形式で保存 |
| 論理削除 | `deleted_at` カラムで管理 |
| 監査カラム | `created_at`, `updated_at`, `created_by`, `updated_by` |

### 1.2 共通カラム

全テーブルに以下のカラムを含める：

```sql
-- 基本
id          VARCHAR(36)   PRIMARY KEY,  -- 例: usr_abc123def456
created_at  TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
updated_at  TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

-- 監査（必要に応じて）
created_by  VARCHAR(36)   REFERENCES users(id),
updated_by  VARCHAR(36)   REFERENCES users(id),

-- 論理削除（必要に応じて）
deleted_at  TIMESTAMP     NULL
```

---

## 2. エンティティ定義

### 2.1 users（ユーザー）

| カラム | 型 | NULL | デフォルト | 説明 |
|--------|-----|------|----------|------|
| id | VARCHAR(36) | NO | - | 主キー（usr_xxx） |
| email | VARCHAR(255) | NO | - | メールアドレス |
| password_hash | VARCHAR(255) | YES | - | パスワードハッシュ（OAuth時はNULL） |
| name | VARCHAR(100) | NO | - | 表示名 |
| avatar_url | VARCHAR(500) | YES | - | アバター画像URL |
| role | ENUM | NO | 'user' | user / admin / super_admin |
| status | ENUM | NO | 'active' | active / inactive / suspended |
| email_verified_at | TIMESTAMP | YES | - | メール認証日時 |
| last_login_at | TIMESTAMP | YES | - | 最終ログイン日時 |
| created_at | TIMESTAMP | NO | NOW() | 作成日時 |
| updated_at | TIMESTAMP | NO | NOW() | 更新日時 |
| deleted_at | TIMESTAMP | YES | - | 論理削除日時 |

**制約**:
- UNIQUE: `email` (WHERE deleted_at IS NULL)
- INDEX: `email`, `status`, `role`

**関連機能ID**: ACCT-001, ACCT-002, ACCT-003

---

### 2.2 sessions（セッション）

| カラム | 型 | NULL | デフォルト | 説明 |
|--------|-----|------|----------|------|
| id | VARCHAR(36) | NO | - | 主キー（ses_xxx） |
| user_id | VARCHAR(36) | NO | - | FK: users.id |
| refresh_token | VARCHAR(500) | NO | - | リフレッシュトークン |
| user_agent | VARCHAR(500) | YES | - | ブラウザ情報 |
| ip_address | VARCHAR(45) | YES | - | IPアドレス |
| expires_at | TIMESTAMP | NO | - | 有効期限 |
| created_at | TIMESTAMP | NO | NOW() | 作成日時 |
| revoked_at | TIMESTAMP | YES | - | 無効化日時 |

**制約**:
- FOREIGN KEY: `user_id` → `users(id)` ON DELETE CASCADE
- INDEX: `user_id`, `refresh_token`, `expires_at`

**関連機能ID**: AUTH-009, AUTH-010

---

### 2.3 oauth_accounts（OAuth連携）

| カラム | 型 | NULL | デフォルト | 説明 |
|--------|-----|------|----------|------|
| id | VARCHAR(36) | NO | - | 主キー（oau_xxx） |
| user_id | VARCHAR(36) | NO | - | FK: users.id |
| provider | VARCHAR(50) | NO | - | google / github / etc |
| provider_user_id | VARCHAR(255) | NO | - | プロバイダー側のユーザーID |
| access_token | TEXT | YES | - | アクセストークン（暗号化） |
| refresh_token | TEXT | YES | - | リフレッシュトークン（暗号化） |
| expires_at | TIMESTAMP | YES | - | トークン有効期限 |
| created_at | TIMESTAMP | NO | NOW() | 作成日時 |
| updated_at | TIMESTAMP | NO | NOW() | 更新日時 |

**制約**:
- FOREIGN KEY: `user_id` → `users(id)` ON DELETE CASCADE
- UNIQUE: (`provider`, `provider_user_id`)
- INDEX: `user_id`

**関連機能ID**: AUTH-002, AUTH-003

---

### 2.4 password_resets（パスワードリセット）

| カラム | 型 | NULL | デフォルト | 説明 |
|--------|-----|------|----------|------|
| id | VARCHAR(36) | NO | - | 主キー |
| email | VARCHAR(255) | NO | - | 対象メールアドレス |
| token | VARCHAR(255) | NO | - | リセットトークン（ハッシュ） |
| expires_at | TIMESTAMP | NO | - | 有効期限 |
| used_at | TIMESTAMP | YES | - | 使用日時 |
| created_at | TIMESTAMP | NO | NOW() | 作成日時 |

**制約**:
- INDEX: `email`, `token`
- TTL: 作成から24時間後に自動削除

**関連機能ID**: AUTH-006

---

### 2.5 audit_logs（監査ログ）

| カラム | 型 | NULL | デフォルト | 説明 |
|--------|-----|------|----------|------|
| id | VARCHAR(36) | NO | - | 主キー（aud_xxx） |
| actor_id | VARCHAR(36) | YES | - | 実行者（未認証時はNULL） |
| actor_type | VARCHAR(50) | NO | - | user / system / api_key |
| action | VARCHAR(100) | NO | - | 操作種別 |
| resource_type | VARCHAR(100) | NO | - | 対象リソース種別 |
| resource_id | VARCHAR(36) | YES | - | 対象リソースID |
| changes | JSON | YES | - | 変更内容（diff） |
| ip_address | VARCHAR(45) | YES | - | IPアドレス |
| user_agent | VARCHAR(500) | YES | - | ブラウザ情報 |
| metadata | JSON | YES | - | 追加情報 |
| created_at | TIMESTAMP | NO | NOW() | 作成日時 |

**制約**:
- INDEX: `actor_id`, `action`, `resource_type`, `created_at`
- PARTITION: 月別パーティション推奨

**関連機能ID**: AUDIT-001

---

## 3. ER図

```
┌──────────────────┐       ┌──────────────────┐
│      users       │       │     sessions     │
├──────────────────┤       ├──────────────────┤
│ id (PK)          │───┐   │ id (PK)          │
│ email (UNIQUE)   │   │   │ user_id (FK)     │───┐
│ password_hash    │   │   │ refresh_token    │   │
│ name             │   │   │ user_agent       │   │
│ role             │   │   │ ip_address       │   │
│ status           │   │   │ expires_at       │   │
│ ...              │   │   │ ...              │   │
└──────────────────┘   │   └──────────────────┘   │
         │             │                          │
         │             └──────────────────────────┘
         │
         │   ┌──────────────────┐
         │   │  oauth_accounts  │
         │   ├──────────────────┤
         └───│ user_id (FK)     │
             │ provider         │
             │ provider_user_id │
             │ ...              │
             └──────────────────┘
```

---

## 4. 整合性ルール

### 4.1 参照整合性

| 子テーブル | 親テーブル | アクション |
|-----------|-----------|----------|
| sessions | users | ON DELETE CASCADE |
| oauth_accounts | users | ON DELETE CASCADE |
| audit_logs | users | ON DELETE SET NULL |

### 4.2 ビジネスルール整合性

| ルール | 実装方法 |
|-------|---------|
| メールは一意 | UNIQUE制約（論理削除考慮） |
| 1ユーザー1プロバイダー1アカウント | UNIQUE(provider, provider_user_id) |
| パスワードまたはOAuth必須 | アプリケーション層でチェック |
| 管理者は最低1人存在 | アプリケーション層でチェック |

### 4.3 論理削除ルール

| テーブル | 論理削除 | 理由 |
|---------|---------|------|
| users | ✅ | 監査証跡、復旧可能性 |
| sessions | ❌ | 短命データ、物理削除OK |
| oauth_accounts | ❌ | 親と連動削除 |
| password_resets | ❌ | TTLで自動削除 |
| audit_logs | ❌ | 不変データ（削除不可） |

---

## 5. インデックス戦略

### 5.1 インデックス一覧

| テーブル | インデックス名 | カラム | 種類 | 目的 |
|---------|--------------|--------|------|------|
| users | idx_users_email | email | UNIQUE | ログイン検索 |
| users | idx_users_status_role | status, role | BTREE | 一覧フィルタ |
| sessions | idx_sessions_user | user_id | BTREE | ユーザー別一覧 |
| sessions | idx_sessions_token | refresh_token | BTREE | トークン検証 |
| audit_logs | idx_audit_actor | actor_id, created_at | BTREE | 履歴検索 |
| audit_logs | idx_audit_resource | resource_type, resource_id | BTREE | リソース別検索 |

### 5.2 インデックス設計ルール

- 検索条件に使うカラムにはインデックス
- WHERE + ORDER BY の組み合わせを考慮
- カーディナリティの高いカラムを優先
- 複合インデックスは順序に注意

---

## 6. マイグレーション管理

### 6.1 命名規則

```
{timestamp}_{action}_{target}.sql

例:
20240115100000_create_users_table.sql
20240115100001_create_sessions_table.sql
20240120100000_add_avatar_to_users.sql
```

### 6.2 マイグレーションチェックリスト

新規テーブル作成時:
- [ ] 主キー（UUID）を設定
- [ ] 共通カラム（created_at, updated_at）を追加
- [ ] 必要に応じて論理削除カラムを追加
- [ ] 外部キー制約を設定
- [ ] 必要なインデックスを作成
- [ ] ロールバック用のDOWNスクリプトを作成

カラム追加時:
- [ ] デフォルト値を設定（NOT NULLの場合）
- [ ] 既存データの移行を考慮
- [ ] インデックスの追加が必要か検討

---

## 7. データ保持ポリシー

### 7.1 保持期間

| データ種別 | 保持期間 | 根拠 |
|-----------|---------|------|
| ユーザーデータ | 退会後3年 | 法的要件 |
| セッション | 有効期限後即削除 | 不要データ |
| パスワードリセット | 24時間 | セキュリティ |
| 監査ログ | 7年 | 監査要件 |
| APIログ | 90日 | 運用要件 |

### 7.2 削除スケジュール

```yaml
daily:
  - expired_sessions（期限切れセッション）
  - expired_password_resets（期限切れリセットトークン）

weekly:
  - old_api_logs（90日以上前のAPIログ）

monthly:
  - inactive_users（3年以上アクティビティなし、通知後削除）
```

---

## 8. セキュリティ考慮事項

### 8.1 機密データの扱い

| データ | 暗号化 | マスキング | 備考 |
|-------|-------|----------|------|
| password_hash | ハッシュ化（bcrypt） | - | 平文保存禁止 |
| access_token | 暗号化（AES-256） | - | DBに保存する場合 |
| refresh_token | 暗号化（AES-256） | - | DBに保存する場合 |
| email | - | ログ出力時マスク | u***@example.com |
| ip_address | - | 必要に応じてマスク | - |

### 8.2 アクセス制御

| ロール | 読み取り | 書き込み | 削除 |
|-------|---------|---------|------|
| app_user | 自分のデータのみ | 自分のデータのみ | 不可 |
| app_admin | 全データ | 全データ | 論理削除のみ |
| db_admin | 全データ | 全データ | 物理削除可 |

---

## 9. データモデル実装チェックリスト

### 9.1 テーブル作成時

- [ ] 主キー形式が統一されている（xxx_UUID）
- [ ] 共通カラムが含まれている
- [ ] 外部キー制約が設定されている
- [ ] インデックスが適切に設定されている
- [ ] 論理削除の要否が決定されている
- [ ] 機密データの暗号化方式が決定されている

### 9.2 リリース前

- [ ] マイグレーションファイルが揃っている
- [ ] ロールバック手順が確認されている
- [ ] 初期データ投入スクリプトがある
- [ ] バックアップ/リストア手順が文書化されている

---

## 変更履歴

| 日付 | 変更内容 | 変更者 |
|------|---------|-------|
| | 初版作成 | |
