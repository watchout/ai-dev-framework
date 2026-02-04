# AI Development Framework v3.2

AI駆動の開発フレームワーク。曖昧なプロダクトアイデアから実装まで、品質を保証しながら自動化する。

## 特徴

- **IEEE/ISO準拠のSSOT**: 機能仕様書を国際規格ベースで定義（3層構造: Core/Contract/Detail）
- **8段階の品質ゲート**: SSOT監査からCI/PRまで、各工程で品質を保証
- **AI中断プロトコル**: AIが不明点を推測せず、必ず確認する体制
- **止まらないルール**: DETAIL層はデフォルトで進み、Decision Backlogで管理
- **完全な開発ライフサイクル**: アイデア → 仕様 → 実装 → テスト → デプロイ → 保守
- **5種類のプロジェクトタイプ**: app / lp / hp / api / cli
- **知識データベース**: docs/knowledge/ にドメイン知識を蓄積し、仕様品質を向上

---

## クイックスタート

### 前提条件
- Node.js 18+
- npm

### インストール
```bash
git clone https://github.com/watchout/ai-dev-platform.git
cd ai-dev-platform
npm install
npm link
```

### 利用可能なコマンド
```bash
framework --help
```

### 新規プロジェクト
```bash
framework init my-project --type=app
cd my-project
framework discover
framework generate business
framework generate product
framework generate technical
framework plan
framework run --auto
framework audit all
```

### 既存プロジェクト
```bash
cd /path/to/existing-project
framework retrofit
framework plan
framework run --auto
framework audit all
```

### 進捗確認
```bash
framework status
```

詳細は [docs/GETTING_STARTED.md](docs/GETTING_STARTED.md) を参照。

---

## CLIコマンド

```
framework init [name]       プロジェクト初期化（--type=app|lp|hp|api|cli）
framework discover          ディスカバリー（ヒアリング実行）
framework generate <step>   SSOT生成（business|product|technical）
framework plan              実装計画作成（タスク分解）
framework audit [target]    品質監査（ssot|code|test|visual|all）
framework run <task-id>     タスク実行（--auto で連続実行）
framework status            進捗表示（--json でダッシュボード連携）
framework retrofit          既存プロジェクト導入
framework update            フレームワーク更新
```

---

## ドキュメント構成

| # | ドキュメント | 内容 |
|---|------------|------|
| 00 | MASTER_GUIDE | 全体マップ・プロジェクトタイプ別プロファイル |
| 01-07 | プロセス定義 | 開発プロセス・ライフサイクル・マーケティング |
| 08-10 | ディスカバリー〜生成 | ヒアリング・ドキュメント生成・生成チェーン |
| 11-13 | SSOT | フォーマット（3層構造）・監査基準 |
| 14 | 実装順序 | タスク分解・縦スライス・優先度定義 |
| 15-16 | プロンプト | フォーマット・監査基準 |
| 17 | コード監査 | 実装品質監査・Adversarial Review |
| 18-20 | テスト | テスト実施・CI/PR・ビジュアルテスト |
| 21 | AI中断 | 独断禁止プロトコル・止まらないルール・Memory Persistence |
| 22-24 | 検証〜保守 | 機能検証・デプロイ・変更管理 |
| 25 | 検証ループ | Checkpoint/Verify・pass@k metrics |

### ガイド

| ドキュメント | 対象 |
|------------|------|
| [GETTING_STARTED.md](docs/GETTING_STARTED.md) | 初めての方 |
| [GUIDE_NEW_PROJECT.md](docs/GUIDE_NEW_PROJECT.md) | 新規プロジェクト |
| [GUIDE_EXISTING_PROJECT.md](docs/GUIDE_EXISTING_PROJECT.md) | 既存プロジェクト導入 |
| [FRAMEWORK_SUMMARY.md](docs/FRAMEWORK_SUMMARY.md) | 全体サマリー・引き継ぎ |

---

## プロジェクトタイプ

| タイプ | 用途 | コマンド |
|--------|------|---------|
| `app` | フルスタックWebアプリ（デフォルト） | `framework init my-app` |
| `lp` | ランディングページ | `framework init my-lp --type=lp` |
| `hp` | ホームページ | `framework init my-hp --type=hp` |
| `api` | API/バックエンド | `framework init my-api --type=api` |
| `cli` | CLIツール | `framework init my-cli --type=cli` |

タイプによって生成されるSSOT・実行される監査・Discoveryの範囲が変わります。

---

## 関連リポジトリ

| リポジトリ | 説明 |
|-----------|------|
| [ai-dev-platform](https://github.com/watchout/ai-dev-platform) | CLIツール本体（`framework` コマンド） |

---

## ライセンス

MIT
