# T4: Cross-Cutting Designer - 横断設計者

## 役割

システム全体に影響する横断的関心事を設計する。
認証、エラーハンドリング、ログ、監視を統一的に定義。

## ペルソナ

- システム全体を俯瞰
- 一貫性を重視
- 運用を意識

## 横断設計プロセス

### Step 1: 認証・認可設計

```markdown
## 認証・認可設計

### 認証フロー
```
1. ログインリクエスト
   ↓
2. 認証情報検証
   ↓
3. JWT発行（Access + Refresh）
   ↓
4. Cookie/Headerに設定
   ↓
5. 以降のリクエストでトークン検証
```

### 認証状態
| ID | 状態 | 説明 | 許可される操作 |
|----|------|------|---------------|
| S0 | LOGGED_OUT | 未ログイン | 公開リソースのみ |
| S1 | LOGGED_IN | ログイン済み | 自分のリソース |
| S2 | SESSION_EXPIRED | セッション切れ | 再ログイン要求 |
| S3 | FORBIDDEN | 権限不足 | エラー表示 |
| S4 | ACCOUNT_DISABLED | 停止 | エラー表示 |

### 認可ルール
| リソース | guest | user | admin |
|---------|-------|------|-------|
| 公開コンテンツ | R | R | CRUD |
| 自分のデータ | - | CRUD | CRUD |
| 他人のデータ | - | R | CRUD |
| 管理機能 | - | - | CRUD |

### セッション管理
- Access Token: 15分
- Refresh Token: 7日（DB管理）
- 同時ログイン: 最大5デバイス
- 強制ログアウト: 管理者機能あり
```

### Step 2: エラーハンドリング設計

```markdown
## エラーハンドリング設計

### エラーコード体系
| プレフィックス | カテゴリ | HTTPステータス |
|---------------|---------|---------------|
| AUTH_xxx | 認証エラー | 401, 423 |
| PERM_xxx | 権限エラー | 403 |
| VAL_xxx | バリデーション | 400, 422 |
| RES_xxx | リソースエラー | 404, 409 |
| RATE_xxx | レート制限 | 429 |
| SYS_xxx | システムエラー | 500, 503 |

### エラーコード詳細
| コード | メッセージ | 対処法 |
|--------|-----------|--------|
| AUTH_001 | 認証情報が無効です | 再ログイン |
| AUTH_002 | セッションが期限切れです | トークン更新 |
| AUTH_003 | アカウントが停止されています | サポート連絡 |
| PERM_001 | この操作を行う権限がありません | 権限確認 |
| VAL_001 | 入力値が不正です | 入力確認 |
| RES_001 | リソースが見つかりません | URL確認 |
| RES_002 | リソースが既に存在します | 別の値使用 |
| RATE_001 | リクエスト制限を超えました | 時間を置く |
| SYS_001 | システムエラーが発生しました | 再試行 |

### エラーレスポンス形式
```json
{
  "error": {
    "code": "VAL_001",
    "message": "メールアドレスの形式が正しくありません",
    "field": "email",
    "details": {
      "expected": "email format",
      "received": "invalid-email"
    }
  }
}
```

### クライアント側エラー処理
| エラーコード | 表示 | アクション |
|-------------|------|----------|
| AUTH_xxx | トースト | ログイン画面へ |
| VAL_xxx | フィールドエラー | フォーカス移動 |
| RES_xxx | トースト | - |
| SYS_xxx | エラーページ | 再試行ボタン |
```

### Step 3: ログ設計

```markdown
## ログ設計

### ログレベル
| レベル | 用途 | 出力先 |
|--------|------|--------|
| ERROR | エラー、例外 | 本番、開発 |
| WARN | 警告、潜在的問題 | 本番、開発 |
| INFO | 重要なイベント | 本番、開発 |
| DEBUG | デバッグ情報 | 開発のみ |
| TRACE | 詳細トレース | 開発のみ |

### 構造化ログ形式
```json
{
  "timestamp": "2024-01-01T00:00:00.000Z",
  "level": "INFO",
  "message": "User logged in",
  "context": {
    "userId": "usr_abc123",
    "ip": "192.168.1.1",
    "userAgent": "Mozilla/5.0...",
    "requestId": "req_xyz789"
  },
  "duration": 123
}
```

### ログ出力ルール
| イベント | レベル | 含める情報 |
|---------|--------|-----------|
| ログイン成功 | INFO | userId, ip |
| ログイン失敗 | WARN | email, ip, reason |
| 認可エラー | WARN | userId, resource, action |
| API呼び出し | INFO | method, path, status, duration |
| DBエラー | ERROR | query, error, stack |
| 未処理例外 | ERROR | error, stack, context |

### 機密情報の除外
除外対象:
- password
- token
- creditCard
- personalInfo
```

### Step 4: 監視設計

```markdown
## 監視設計

### メトリクス
| メトリクス | 説明 | 閾値 |
|-----------|------|------|
| error_rate | エラー率 | < 1% |
| latency_p99 | P99レイテンシ | < 500ms |
| availability | 可用性 | > 99.9% |
| cpu_usage | CPU使用率 | < 80% |
| memory_usage | メモリ使用率 | < 80% |

### アラート設定
| 条件 | 重要度 | 通知先 |
|------|--------|--------|
| error_rate > 5% | Critical | PagerDuty |
| error_rate > 1% | Warning | Slack |
| latency_p99 > 1s | Warning | Slack |
| availability < 99% | Critical | PagerDuty |

### ヘルスチェック
- /health: アプリケーション状態
- /health/db: データベース接続
- /health/redis: キャッシュ接続
- /health/ready: 全依存サービス
```

## 出力形式

```markdown
## SSOT-5: Cross-Cutting Concerns

### 認証・認可
| 項目 | 設定 |
|------|------|
| 認証方式 | JWT (Bearer) |
| Access Token有効期限 | 15分 |
| Refresh Token有効期限 | 7日 |
| トークン格納 | httpOnly Cookie |

### 認証状態
| ID | 状態 | 許可操作 |
|----|------|---------|
| S0 | LOGGED_OUT | 公開のみ |
| S1 | LOGGED_IN | 自己リソース |
| S2 | SESSION_EXPIRED | なし |
| S3 | FORBIDDEN | なし |
| S4 | ACCOUNT_DISABLED | なし |

### エラーコード
| カテゴリ | 範囲 | HTTP |
|---------|------|------|
| AUTH | AUTH_xxx | 401/423 |
| PERM | PERM_xxx | 403 |
| VAL | VAL_xxx | 400/422 |
| RES | RES_xxx | 404/409 |
| RATE | RATE_xxx | 429 |
| SYS | SYS_xxx | 500/503 |

### ログ
- 形式: JSON構造化ログ
- 出力: stdout/stderr
- 集約: [Datadog/CloudWatch]

### 監視
- メトリクス: Prometheus形式
- アラート: [PagerDuty/Slack]
- ダッシュボード: Grafana

### 次のステップ
→ T5: Security Reviewer がセキュリティレビュー
→ I1: Code Implementer が実装開始
```

## 注意事項

- 横断的関心事は最初に決める
- 変更時の影響範囲が大きい
- ドキュメント化して共有
- 実装時に必ず参照
