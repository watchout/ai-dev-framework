# プロンプト管理システム

プロンプトテンプレートの CRUD、変数埋め込み、バージョン管理を提供する統合システムです。

## 機能

### 1. テンプレート管理 (CRUD)
- **作成**: `PromptManager.create()`
- **読み込み**: `PromptManager.read()`
- **更新**: `PromptManager.update()`
- **削除**: `PromptManager.delete()`
- **検索**: `PromptManager.list()`

### 2. 変数埋め込み
- `{{variableName}}` パターン対応
- `$variableName` パターン対応
- 自動バリデーション（型、必須フィールド、パターン、列挙値）
- 型安全な変数処理

### 3. バージョン管理
- 自動バージョニング（v1.0.0 形式）
- 変更履歴の記録
- ロールバック機能
- 版管理（特定バージョンの取得）

### 4. REST API
- Express ルーター統合
- JSON リクエスト/レスポンス
- エラーハンドリング
- バリデーション

## インストール

```typescript
import { PromptManager, createPromptRouter } from '@lib/prompt-manager';
```

## 使用例

### 基本的な使用

```typescript
const manager = new PromptManager();

// テンプレート作成
const template = await manager.create({
  name: 'Welcome Email',
  description: 'Welcome email template',
  content: 'Hello {{name}}, welcome to {{product}}!',
  variables: [
    {
      name: 'name',
      type: 'string',
      description: 'User full name',
      required: true,
    },
    {
      name: 'product',
      type: 'string',
      description: 'Product name',
      required: true,
    },
  ],
  createdBy: 'system',
});

// テンプレートの取得
const fetched = await manager.read(template.id);

// テンプレートのレンダリング
const result = await manager.render({
  templateId: template.id,
  variables: {
    name: 'Alice',
    product: 'MyApp',
  },
});

console.log(result.renderedContent);
// 出力: "Hello Alice, welcome to MyApp!"
```

### Express 統合

```typescript
import express from 'express';
import { PromptManager, createPromptRouter } from '@lib/prompt-manager';

const app = express();
const manager = new PromptManager();

app.use('/api/prompts', createPromptRouter(manager));
```

### API エンドポイント

```bash
# テンプレート作成
POST /api/prompts
{
  "name": "Welcome Email",
  "description": "...",
  "content": "Hello {{name}}!",
  "variables": [...],
  "createdBy": "user1"
}

# テンプレート取得
GET /api/prompts/:id
GET /api/prompts/:id?version=v1.0.0

# テンプレート更新
PATCH /api/prompts/:id
{
  "name": "Updated name",
  "updatedBy": "user1",
  "changelog": "Updated greeting"
}

# テンプレート削除
DELETE /api/prompts/:id

# テンプレート検索
GET /api/prompts?name=Welcome&category=email&tags=notification

# バージョン履歴
GET /api/prompts/:id/versions

# ロールバック
POST /api/prompts/:id/rollback
{
  "version": "v1.0.0",
  "rolledBackBy": "user1"
}

# レンダリング
POST /api/prompts/render
{
  "templateId": "...",
  "variables": {
    "name": "Alice",
    "product": "MyApp"
  }
}

# 変数抽出
POST /api/prompts/extract-variables
{
  "content": "Hello {{name}}, welcome to {{product}}!"
}
```

## API レスポンス形式

### 成功時

```json
{
  "success": true,
  "data": {...},
  "timestamp": "2026-03-16T19:04:00Z"
}
```

### エラー時

```json
{
  "success": false,
  "error": {
    "code": "ERROR",
    "message": "Template not found",
    "details": {}
  },
  "timestamp": "2026-03-16T19:04:00Z"
}
```

## プロンプトテンプレート構造

```typescript
interface PromptTemplate {
  id: string;                          // UUID
  name: string;                        // テンプレート名
  description: string;                 // 説明
  content: string;                     // テンプレート本体
  variables: Variable[];               // 使用変数一覧
  tags: string[];                      // タグ（検索用）
  version: string;                     // セマンティックバージョン
  createdAt: Date;                     // 作成日時
  updatedAt: Date;                     // 更新日時
  createdBy: string;                   // 作成者
  isActive: boolean;                   // アクティブ状態
  category?: string;                   // カテゴリ
  metadata?: Record<string, unknown>;  // 任意のメタデータ
}
```

## 変数定義

```typescript
interface Variable {
  name: string;                    // 変数名
  type: 'string' | 'number' | 'boolean' | 'array' | 'object';
  description: string;             // 説明
  required: boolean;               // 必須フラグ
  default?: string | number | boolean;  // デフォルト値
  pattern?: string;                // 正規表現パターン
  enum?: (string | number)[];      // 列挙値
}
```

## バリデーション

### 型チェック

```typescript
// 型が不正な場合はエラー
const result = await manager.render({
  templateId: '...',
  variables: {
    count: 'not-a-number',  // ❌ type: 'number' 期待
  },
});
// ValidationError: "count" should be of type number
```

### パターンマッチング

```typescript
// 正規表現マッチング
const variable: Variable = {
  name: 'email',
  type: 'string',
  description: 'Email address',
  required: true,
  pattern: '^[^@]+@[^@]+\\.[^@]+$',  // メールアドレス形式
};

// 不正なメールはエラー
manager.render({
  variables: { email: 'invalid-email' },
  // ValidationError: pattern does not match
});
```

### 列挙値チェック

```typescript
// 列挙値に指定された値のみ受け付ける
const variable: Variable = {
  name: 'status',
  type: 'string',
  description: 'Status',
  required: true,
  enum: ['active', 'inactive', 'pending'],
};

// enum に無い値はエラー
manager.render({
  variables: { status: 'invalid' },
  // ValidationError: must be one of active, inactive, pending
});
```

## バージョン管理

### 自動バージョニング

テンプレート更新時、バージョンは自動的にインクリメントされます：

```
初期作成: v1.0.0
第1回更新: v1.0.1
第2回更新: v1.0.2
...
```

### バージョン履歴

```typescript
const versions = await manager.getVersions(templateId);
// [
//   { version: 'v1.0.0', content: '...', changelog: '...' },
//   { version: 'v1.0.1', content: '...', changelog: '...' },
// ]
```

### ロールバック

```typescript
const rolled = await manager.rollback(
  templateId,
  'v1.0.0',  // 戻す先のバージョン
  'user1'    // ロールバック実行者
);
```

## カスタムストレージ

デフォルトはメモリストレージです。データベースを使う場合は `StorageAdapter` を実装します：

```typescript
class DatabaseStorage implements StorageAdapter {
  async create(template: PromptTemplate): Promise<PromptTemplate> {
    // DB に保存
    return db.templates.insert(template);
  }

  async read(id: string, version?: string): Promise<PromptTemplate | null> {
    // DB から取得
    return db.templates.findById(id);
  }

  // ... 他のメソッド実装
}

const manager = new PromptManager(new DatabaseStorage());
```

## テスト

```bash
npm test -- prompt-manager
```

テストカバレッジ:
- ✅ CRUD 操作
- ✅ 変数抽出
- ✅ バリデーション（型、パターン、列挙値）
- ✅ レンダリング
- ✅ バージョン管理
- ✅ ロールバック
- ✅ フィルター検索

## ベストプラクティス

### 1. 変数名は明確に

```typescript
// ❌ 不適切
content: 'Hello {{x}}, welcome to {{y}}!'

// ✅ 良い
content: 'Hello {{userName}}, welcome to {{productName}}!'
```

### 2. パターンを指定して入力値を検証

```typescript
{
  name: 'email',
  type: 'string',
  required: true,
  pattern: '^[^@]+@[^@]+\\.[^@]+$',
}
```

### 3. デフォルト値とオプショナル変数を活用

```typescript
{
  name: 'greeting',
  type: 'string',
  required: false,
  default: 'Hello',
}
```

### 4. タグとカテゴリで整理

```typescript
await manager.create({
  // ...
  tags: ['email', 'notification', 'welcome'],
  category: 'user-onboarding',
});
```

## パフォーマンス考慮

- メモリストレージ: 小〜中規模（< 1000テンプレート）推奨
- 大規模運用: データベースストレージ必須
- レンダリング: O(n) （n = テンプレート内の変数数）

## 今後の拡張

- [ ] テンプレート継承（ベーステンプレート）
- [ ] 条件付きブロック（if/else）
- [ ] ループサポート（for/each）
- [ ] 組み込み関数（toUpperCase, formatDate など）
- [ ] A/B テスト機能
- [ ] レンダリング統計
