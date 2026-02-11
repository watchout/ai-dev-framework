# Analysis Team Agents - 分析チームエージェント定義

> クラスメソッド清水氏の実証に基づく3エージェント構成の分析チーム

## 概要

Webサイトやアプリケーションを複数の専門観点から並行分析し、
統合レポートを自動生成する。

## エージェント構成

### Agent 1: SEO Analyst（SEO分析者）

**役割**: 検索エンジン最適化の観点から分析

**分析項目**:
- メタタグ（title, description, keywords）
- 見出し構造（h1-h6の階層）
- 内部リンク構造
- 画像のalt属性
- ページ速度（Core Web Vitals）
- モバイルフレンドリー
- 構造化データ（JSON-LD）
- サイトマップ
- robots.txt

**出力形式**:
```markdown
## SEO分析レポート

### スコア: [0-100]

### 重要な問題
| 優先度 | 問題 | 影響 | 推奨アクション |
|--------|------|------|---------------|
| 高 | [問題] | [影響] | [アクション] |

### 改善機会
- [改善点1]
- [改善点2]

### 良好な点
- [良好な点1]
- [良好な点2]

### 詳細データ
- Core Web Vitals:
  - LCP: [値] ([良好/要改善/不良])
  - FID: [値] ([良好/要改善/不良])
  - CLS: [値] ([良好/要改善/不良])
```

### Agent 2: UI/UX Evaluator（UI/UX評価者）

**役割**: デザイン・ユーザビリティの観点から評価

**評価項目**:
- 視覚的階層
- 色使い・コントラスト
- タイポグラフィ
- ナビゲーション
- フォーム設計
- マイクロインタラクション
- レスポンシブデザイン
- アクセシビリティ（WCAG準拠）
- ユーザーフロー

**出力形式**:
```markdown
## UI/UX評価レポート

### スコア: [0-100]

### ヒューリスティック評価
| 原則 | スコア | コメント |
|------|--------|----------|
| 可視性 | [1-5] | [コメント] |
| マッチング | [1-5] | [コメント] |
| 一貫性 | [1-5] | [コメント] |
| エラー予防 | [1-5] | [コメント] |

### アクセシビリティ
- WCAG 2.1 AA準拠: [Yes/No]
- 問題点:
  - [問題1]
  - [問題2]

### 改善推奨
| 優先度 | 推奨 | 期待効果 |
|--------|------|----------|
| 高 | [推奨] | [効果] |
```

### Agent 3: Security Auditor（セキュリティ監査者）

**役割**: セキュリティの観点から診断

**診断項目**:
- HTTPS設定
- セキュリティヘッダー
  - CSP
  - X-Frame-Options
  - X-Content-Type-Options
  - Strict-Transport-Security
- Cookie設定（Secure, HttpOnly, SameSite）
- 依存関係の脆弱性
- 認証・認可
- 入力バリデーション
- OWASP Top 10

**出力形式**:
```markdown
## セキュリティ監査レポート

### リスクレベル: [Critical/High/Medium/Low]

### 発見された脆弱性
| 重大度 | 脆弱性 | 影響 | 推奨対策 |
|--------|--------|------|----------|
| Critical | [脆弱性] | [影響] | [対策] |

### セキュリティヘッダー
| ヘッダー | 状態 | 推奨値 |
|----------|------|--------|
| CSP | [設定済み/未設定] | [値] |

### 依存関係
- 脆弱性あり: [件数]
- 更新推奨: [パッケージリスト]

### OWASP Top 10 チェック
| リスク | 状態 | 備考 |
|--------|------|------|
| インジェクション | [OK/要注意] | [備考] |
```

## Report Integrator（レポート統合者）

**役割**: 各分析結果を統合してHTMLレポートを生成

**統合プロセス**:
1. 各エージェントの出力を受け取る
2. 重複を排除
3. 優先度順にソート
4. 統合レポートを生成

**出力形式**:
```html
<!DOCTYPE html>
<html lang="ja">
<head>
  <title>サイト分析レポート - [サイト名]</title>
  <style>
    /* レポート用スタイル */
  </style>
</head>
<body>
  <h1>サイト分析レポート</h1>

  <section id="summary">
    <h2>エグゼクティブサマリー</h2>
    <div class="scores">
      <div>SEO: [スコア]/100</div>
      <div>UI/UX: [スコア]/100</div>
      <div>Security: [リスクレベル]</div>
    </div>
  </section>

  <section id="critical">
    <h2>重要なアクション（即座に対応が必要）</h2>
    <!-- Critical issues from all reports -->
  </section>

  <section id="seo">
    <h2>SEO分析</h2>
    <!-- SEO report content -->
  </section>

  <section id="uiux">
    <h2>UI/UX評価</h2>
    <!-- UI/UX report content -->
  </section>

  <section id="security">
    <h2>セキュリティ監査</h2>
    <!-- Security report content -->
  </section>

  <section id="roadmap">
    <h2>改善ロードマップ</h2>
    <!-- Prioritized action items -->
  </section>
</body>
</html>
```

## 実行フロー

```
1. 分析対象の指定（URL or ローカルパス）
   ↓
2. 並行実行:
   ├── SEO Analyst
   ├── UI/UX Evaluator
   └── Security Auditor
   ↓
3. Report Integrator: 統合レポート生成
   ↓
4. 成果物出力:
   ├── docs/analysis/[date]_report.html
   └── docs/analysis/[date]_report.md
```

## 成果物

- `docs/analysis/[date]_report.html` - 統合HTMLレポート
- `docs/analysis/[date]_report.md` - Markdown版
- `docs/analysis/[date]_raw/` - 各エージェントの生データ

## カスタマイズ

追加可能なエージェント:
- Performance Analyst（パフォーマンス分析）
- Content Quality Checker（コンテンツ品質）
- Legal Compliance Checker（法的コンプライアンス）
