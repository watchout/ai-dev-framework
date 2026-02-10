# Interface Contract Template

> 複数エージェント間のインターフェース契約テンプレート
> 事前に明確に定義することで不整合を防止

## 目的

和田氏の事例で明らかになった「インターフェース不整合問題」を防ぐため、
エージェント間の契約を事前に明示化する。

## テンプレート

```markdown
# Interface Contract - [プロジェクト名]

## 参加エージェント

| Agent ID | 役割 | 担当範囲 |
|----------|------|----------|
| Agent 1 | Frontend Developer | UI/UXの実装 |
| Agent 2 | Backend Developer | API/ビジネスロジック |
| Agent 3 | Database Engineer | データモデル/永続化 |

## API Contract (Backend ↔ Frontend)

### Endpoints

| Method | Path | Request | Response | 担当 |
|--------|------|---------|----------|------|
| POST | /api/users | CreateUserRequest | CreateUserResponse | Backend |
| GET | /api/users/:id | - | UserResponse | Backend |
| PUT | /api/users/:id | UpdateUserRequest | UserResponse | Backend |
| DELETE | /api/users/:id | - | void | Backend |

### Request/Response Types

\`\`\`typescript
// CreateUserRequest
interface CreateUserRequest {
  email: string;
  name: string;
  password: string;
}

// CreateUserResponse
interface CreateUserResponse {
  id: string;
  email: string;
  name: string;
  createdAt: string;
}

// UserResponse
interface UserResponse {
  id: string;
  email: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}
\`\`\`

## Database Contract (DB ↔ Backend)

### Tables

\`\`\`sql
-- users table
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
\`\`\`

### Indexes

- `users_email_idx` on `users(email)`

## Event Contract (全エージェント共有)

### Published Events

| Event Name | Payload | Publisher | Subscribers |
|------------|---------|-----------|-------------|
| user.created | { userId, email, name } | Backend | Frontend, Notification |
| user.updated | { userId, changes } | Backend | Frontend |
| user.deleted | { userId } | Backend | Frontend |

## File Structure Contract

\`\`\`
src/
├── frontend/          # Agent 1 担当
│   ├── components/
│   ├── pages/
│   └── hooks/
├── backend/           # Agent 2 担当
│   ├── routes/
│   ├── services/
│   └── middleware/
└── database/          # Agent 3 担当
    ├── migrations/
    ├── models/
    └── seeds/
\`\`\`

## Shared Types

\`\`\`typescript
// shared/types.ts - 全エージェントが参照
export interface User {
  id: string;
  email: string;
  name: string;
}

export interface ApiResponse<T> {
  data: T;
  error?: string;
}
\`\`\`

## Error Codes

| Code | Description | HTTP Status |
|------|-------------|-------------|
| USER_NOT_FOUND | ユーザーが見つからない | 404 |
| EMAIL_ALREADY_EXISTS | メールアドレス重複 | 409 |
| INVALID_CREDENTIALS | 認証情報不正 | 401 |

## Versioning

- Contract Version: 1.0.0
- Last Updated: [日付]
- Breaking Changes: 事前合議必須

## 変更プロトコル

1. 変更提案をIssueとして作成
2. 影響を受けるエージェントに通知
3. 合議で承認
4. 契約を更新
5. 各エージェントが実装を調整
```

## 使い方

1. プロジェクト開始時にこのテンプレートをコピー
2. 各セクションを具体的に埋める
3. 全エージェントがこの契約を参照
4. 変更が必要な場合は変更プロトコルに従う

## チェックリスト

- [ ] 参加エージェントと役割を定義
- [ ] API契約（エンドポイント、型）を定義
- [ ] データベース契約（テーブル、インデックス）を定義
- [ ] イベント契約を定義
- [ ] ファイル構造の担当範囲を定義
- [ ] 共有型を定義
- [ ] エラーコードを定義
