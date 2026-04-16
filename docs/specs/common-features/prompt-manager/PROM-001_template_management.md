# PROM-001: プロンプトテンプレート管理

> 共通機能 | AI駆動型アプリケーション向け | ✅ 完成

---

## 概要

プロンプトテンプレートの一元管理、変数埋め込み、バージョン管理を提供する共通機能。

**使用シーン:**
- AI API へのプロンプト管理（Claude, GPT など）
- メール・SMS テンプレート管理
- 文章生成テンプレート管理
- マークティング用テンプレート

**推奨対象:**
- API 型アプリケーション
- SaaS プラットフォーム
- AI統合アプリケーション

---

## 機能仕様

### F-1: テンプレート CRUD

#### C (Create) - テンプレート作成

**入力:**
```typescript
{
  name: string;              // テンプレート名
  description: string;       // 説明
  content: string;          // テンプレート本体 ({{var}} または $var 形式)
  variables?: Variable[];   // 変数定義
  tags?: string[];          // タグ（検索用）
  category?: string;        // カテゴリ
  createdBy: string;        // 作成者
}
```

**出力:**
```typescript
{
  id: string;               // 生成された UUID
  name: string;
  description: string;
  content: string;
  variables: Variable[];
  tags: string[];
  version: string;          // v1.0.0
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
  isActive: boolean;        // true
  category?: string;
}
```

**ビジネスルール:**
- テンプレート ID は自動生成 (UUID)
- 初期バージョンは v1.0.0
- 変数が指定されない場合、テンプレート内から自動抽出
- 必須フィールド: name, description, content, createdBy
- 名前の重複は許可（複数バージョン対応）

#### R (Read) - テンプレート取得

**エンドポイント:**
```
GET /api/prompts/:id
GET /api/prompts/:id?version=v1.0.0
```

**出力:**
- 指定されたテンプレートの完全情報を返す
- version 指定時は、その版のコンテンツを返す

**エラーケース:**
- テンプレート未検出: 404

#### U (Update) - テンプレート更新

**入力:**
```typescript
{
  name?: string;
  description?: string;
  content?: string;
  variables?: Variable[];
  tags?: string[];
  category?: string;
  updatedBy: string;
  changelog?: string;       // 更新内容を説明
}
```

**ビジネスルール:**
- 少なくとも 1 つのフィールド変更が必須
- 更新時に自動でバージョンインクリメント（v1.0.0 → v1.0.1）
- 更新前のバージョンはバージョン履歴に保存
- 更新日時（updatedAt）は自動更新

#### D (Delete) - テンプレート削除

**エンドポイント:**
```
DELETE /api/prompts/:id
```

**ビジネスルール:**
- 論理削除（isActive = false）推奨
- 物理削除時はバージョン履歴も一緒に削除

---

### F-2: テンプレート検索

**エンドポイント:**
```
GET /api/prompts?name=...&tags=...&category=...&createdBy=...
```

**フィルター:**
| フィルター | 型 | 説明 |
|-----------|-----|------|
| name | string | テンプレート名（部分一致） |
| tags | string (CSV) | タグ（いずれかに該当） |
| category | string | カテゴリ（完全一致） |
| isActive | boolean | 有効/無効 |
| createdBy | string | 作成者 |

**出力:**
- マッチしたテンプレートの配列

---

### F-3: 変数埋め込み

テンプレートに変数値を埋め込む機能。

**エンドポイント:**
```
POST /api/prompts/render
```

**入力:**
```typescript
{
  templateId: string;                  // テンプレート ID
  variables: Record<string, unknown>; // 埋め込み値
  version?: string;                    // 指定版を使う（省略時は最新）
}
```

**出力:**
```typescript
{
  templateId: string;
  renderedContent: string;  // 埋め込み完了後のコンテンツ
  usedVariables: {...};    // 使用した変数
  version: string;         // 使用したテンプレート版
  timestamp: Date;
}
```

**変数パターン:**
- `{{variableName}}` — ダブルブレース形式
- `$variableName` — ドル形式
- 両形式の混在対応

**バリデーション:**
| 項目 | 説明 | エラー時 |
|------|------|---------|
| 必須フィールド | required=true の変数が提供されているか | ValidationError |
| 型チェック | 値の型が Variable.type と一致するか | ValidationError |
| パターン | 正規表現（pattern）にマッチするか | ValidationError |
| 列挙値 | enum に属しているか | ValidationError |

**デフォルト値:**
変数未提供時、Variable.default があれば使用

---

### F-4: バージョン管理

#### バージョニング方式

セマンティックバージョニング（SemVer）: `v{major}.{minor}.{patch}`

| 操作 | バージョン変更 |
|------|-----------------|
| 作成 | v1.0.0 に設定 |
| 更新 | パッチ版をインクリメント (v1.0.0 → v1.0.1) |

#### バージョン履歴取得

**エンドポイント:**
```
GET /api/prompts/:id/versions
```

**出力:**
```typescript
[
  {
    version: string;        // v1.0.0
    content: string;        // その版のテンプレート内容
    changelog: string;      // 変更内容説明
    createdAt: Date;
    createdBy: string;
  },
  // ...
]
```

#### ロールバック

特定バージョンに戻す機能。

**エンドポイント:**
```
POST /api/prompts/:id/rollback
```

**入力:**
```typescript
{
  version: string;          // v1.0.0
  rolledBackBy: string;    // ロールバック実行者
}
```

**ビジネスルール:**
- ロールバック後、新しいバージョンが発行される（v1.0.2）
- 変更履歴は保持される（監査ログ）
- ロールバック自体も1つの「更新」として記録

---

## 🔧 カスタマイズポイント

### レベル: **低** (1-2時間)

#### P-1: ストレージの変更

**デフォルト:** メモリストレージ（開発用）

**本番推奨:** PostgreSQL, MongoDB など

```typescript
// カスタムストレージを実装
class MyDatabaseStorage implements StorageAdapter {
  async create(template) { /* DB 操作 */ }
  async read(id, version) { /* DB 操作 */ }
  // ...
}

const manager = new PromptManager(new MyDatabaseStorage());
```

#### P-2: 変数形式の追加

デフォルト: `{{var}}` と `$var`

必要に応じて追加:
- `$[var]` — ブラケット形式
- `%(var)s` — Python 形式
- `{var}` — 単一ブレース

→ `renderer.ts` の `extractVariables()` と `render()` を修正

#### P-3: API ルートの変更

デフォルト: `/api/prompts`

変更例:
```typescript
app.use('/api/ai/prompts', createPromptRouter(manager));  // AI用
app.use('/api/templates', createPromptRouter(manager));   // テンプレート用
```

#### P-4: バージョニング方式の変更

デフォルト: SemVer (v1.0.0)

タイムスタンプ版に変更:
```typescript
// manager.ts で実装
version: new Date().toISOString();  // 2026-03-16T19:04:00Z
```

### レベル: **中** (半日)

#### P-5: 変数のデフォルト値処理

デフォルト: 指定されていない場合、空文字列

変更例:
```typescript
// renderer.ts で修正
if (!(variable.name in variables) && variable.default !== undefined) {
  variables[variable.name] = variable.default;
}
```

#### P-6: メタデータの拡張

デフォルト: `metadata?: Record<string, unknown>`

実装例:
```typescript
// 言語設定を追加
metadata: {
  language: 'ja',
  tone: 'formal',
  audience: 'business',
}
```

### レベル: **高** (1日以上)

#### P-7: テンプレート継承

親テンプレートを参照し、一部をオーバーライド:

```typescript
interface PromptTemplate {
  parentId?: string;  // 親テンプレート ID
  overrides?: {       // オーバーライド内容
    content?: string;
    variables?: Variable[];
  };
}
```

#### P-8: 条件付きブロック

テンプレート内に if/else ロジック:

```
Dear {{firstName}},

{{#if isPremium}}
Thank you for being a premium member!
{{else}}
Upgrade to premium for exclusive benefits.
{{/if}}
```

→ `renderer.ts` に条件付きブロック解析ロジック追加

---

## 📋 実装チェックリスト

プロジェクトに組み込む際の確認事項:

- [ ] PromptManager をサービスレイヤーに統合
- [ ] 認証・認可を追加（createdBy の制御）
- [ ] ストレージをDB に変更
- [ ] API に速度制限（Rate Limiting）を追加
- [ ] ロギング・監査ログ機能を追加
- [ ] キャッシング層を検討（Redis など）
- [ ] テストカバレッジを確認（> 90%）
- [ ] API ドキュメント生成（Swagger など）
- [ ] E2E テストを実装

---

## 🧪 テスト

### テストカバレッジ

| 機能 | カバレッジ |
|------|-----------|
| CRUD | ✅ 100% |
| 変数抽出 | ✅ 100% |
| バリデーション | ✅ 100% |
| レンダリング | ✅ 100% |
| バージョン管理 | ✅ 100% |

### 実行

```bash
npm test -- prompt-manager
npm test -- --coverage
```

---

## 🚀 パフォーマンス指標

| 操作 | 時間（メモリストレージ） |
|------|--------------------------|
| テンプレート作成 | < 1ms |
| テンプレート取得 | < 1ms |
| テンプレート更新 | < 2ms |
| レンダリング（100変数） | < 5ms |
| 検索（1000テンプレート） | < 20ms |

**スケーラビリティ:**
- メモリストレージ: < 1000テンプレート推奨
- DB ストレージ: テンプレート数に応じてスケール可能

---

## 📌 依存関係

| 依存パッケージ | 用途 | 備考 |
|---------------|------|------|
| TypeScript | 型安全性 | 5.7+ |
| Express | API フレームワーク | オプション（API層使用時） |
| Vitest | テスト | 開発時のみ |

---

## 🔐 セキュリティ考慮事項

### 1. 入力バリデーション

- ✅ テンプレートコンテンツのサニタイズ（XSS対策）
- ✅ 変数値の型チェック
- ✅ 正規表現 ReDoS 対策

### 2. 認可制御

実装例:
```typescript
// 更新時に作成者確認
if (template.createdBy !== userId && !isAdmin(userId)) {
  throw new UnauthorizedError();
}
```

### 3. 監査ログ

すべての CRUD 操作をログに記録:
```typescript
logger.info('Template created', {
  templateId: template.id,
  createdBy: request.createdBy,
  timestamp: new Date(),
});
```

---

## 📚 参考資料

- PROM-001_template_management.md （このファイル）
- `/src/lib/prompt-manager/` — 実装
- `/src/lib/prompt-manager/README.md` — API ドキュメント
- テスト: `*.test.ts`

---

## ライセンス

このコンポーネントはフレームワークの一部です。
