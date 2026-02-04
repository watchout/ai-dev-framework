# 既存プロジェクト導入ガイド

> 既にコードがあるプロジェクトにフレームワークを導入する手順。

---

## 全体フロー

```
Step 1: 状況確認         プロジェクトの現状を把握
Step 2: retrofit 実行    framework retrofit
Step 3: ギャップ対応      不足SSOTを補完
Step 4: 通常フローに合流   framework plan → run → audit
```

---

## Step 1: 状況確認

### 事前チェック

```bash
# プロジェクトディレクトリに移動
cd /path/to/existing-project

# Git管理されているか確認（必須）
git status

# プロジェクト規模を確認
find src/ -name "*.ts" -o -name "*.tsx" -o -name "*.js" -o -name "*.jsx" | wc -l
```

### 導入パターンの判定

```
あなたのプロジェクトは？
│
├─ コードはあるが仕様書がない
│   → パターンA: フル retrofit
│   → 既存コードからSSOTを逆生成
│
├─ コードも仕様書もある（独自フォーマット）
│   → パターンB: 変換 retrofit
│   → 既存仕様書をSSOT形式に変換
│
└─ コードがあり、一部だけ導入したい
    → パターンC: 段階的導入
    → 新機能からフレームワーク適用
```

---

## Step 2: retrofit 実行

### パターンA: フル retrofit

```bash
# スキャンとギャップ分析
framework retrofit --scan-only

# レポートを確認してから実行
framework retrofit
```

### retrofit の処理フロー

```
R-1: 既存コードスキャン
────────────────────────────────
  - ディレクトリ構造の解析
  - 使用技術の検出（package.json, 設定ファイル）
  - 主要ファイルの特定
  - 依存関係の解析

R-2: 既存ドキュメント読み込み
────────────────────────────────
  - README.md, docs/ 等の既存ドキュメントを解析
  - 既存の設計意図を把握

R-3: ギャップ分析
────────────────────────────────
  - フレームワークが求めるSSOTと、既存資産の差分を分析
  - レポートを表示:
    「以下のSSOTが不足しています:
     ✅ SSOT-0_PRD → README.md から50%生成可能
     ❌ SSOT-1_FEATURE_CATALOG → 新規作成が必要
     ✅ SSOT-3_API_CONTRACT → 既存APIから80%逆生成可能
     ✅ SSOT-4_DATA_MODEL → 既存DBスキーマから90%逆生成可能
     ❌ SSOT-5_CROSS_CUTTING → 新規作成が必要」

R-4: SSOT逆生成（ユーザー確認あり）
────────────────────────────────
  - 既存コードからSSOTを逆生成
  - 各SSOTの生成後にユーザー確認
  - 不足部分はDecision Backlogに記録

R-5: CLAUDE.md 生成
────────────────────────────────
  - プロジェクト固有のCLAUDE.mdを生成
  - 技術スタック、ディレクトリ構造を反映

R-6: フレームワーク移行完了
────────────────────────────────
  - docs/ 配下にSSOTを配置
  - framework status で確認
```

---

## Step 3: ギャップ対応

retrofit 後、不足しているSSOTを補完します。

### 優先順位

```
1. SSOT-0_PRD（プロダクト要件）
   → 最重要。プロジェクトの目的とスコープを確定。
   → retrofit で README.md から部分生成されていれば、補完するだけ。

2. SSOT-3_API_CONTRACT（API契約）
   → 既存APIルートから逆生成可能。型定義の確認が必要。

3. SSOT-4_DATA_MODEL（データモデル）
   → 既存DBスキーマから逆生成可能。

4. SSOT-5_CROSS_CUTTING（横断関心事）
   → 認証・エラー・ログの現状を整理。

5. SSOT-1_FEATURE_CATALOG（機能カタログ）
   → 既存機能を棚卸しして一覧化。

6. SSOT-2_UI_STATE（画面・状態遷移）
   → 既存画面のスクリーンショットから逆生成。
```

### 各SSOTの補完方法

```bash
# Claude Code で補完
claude "既存の src/api/ ディレクトリを分析して、
       SSOT-3_API_CONTRACT.md を生成して。
       Freeze 2 レベルで（CONTRACT層まで確定）"

claude "既存のDBマイグレーションファイルを分析して、
       SSOT-4_DATA_MODEL.md を生成して"

claude "既存のUI（src/pages/ と src/components/）を分析して、
       SSOT-2_UI_STATE.md を生成して"
```

---

## Step 4: 通常フローに合流

```bash
# 実装計画（既存機能の整理 + 新機能の追加）
framework plan

# 新機能の開発
framework run NEW-FEAT-001

# 品質監査
framework audit all

# 進捗確認
framework status
```

---

## パターンC: 段階的導入

既存プロジェクト全体を一度に移行するのではなく、新機能から段階的に適用する方法。

### Step 1: 最小限のセットアップ

```bash
# docs/ ディレクトリだけ作成
mkdir -p docs/{design/core,design/features/project,ssot,notes,standards}

# CLAUDE.md を配置
# → 最小限の内容で開始

# フレームワーク規約をコピー
cp -r ai-dev-framework/templates/standards/ docs/standards/
```

### Step 2: 新機能からSSOT適用

```bash
# 新機能のSSOTを作成
claude "以下の新機能のSSOTを作成して:
       機能名: ○○機能
       テンプレート: docs/standards/12_SSOT_FORMAT.md に従って
       Freeze 2 まで確定して"

# 新機能を実装
claude "docs/design/features/project/FEAT-001_xxx.md に基づいて
       ○○機能を実装して"
```

### Step 3: 既存機能を順次SSOT化

```
既存機能のSSOT化は以下の順序で:

1. 最も変更が多い機能から（仕様を明確にする効果が大きい）
2. バグが多い機能から（品質改善の効果が大きい）
3. 新機能と依存関係がある機能から（整合性の確保）
```

---

## 既存プロジェクト向けの注意点

### 既存コードとSSOTの整合性

```
retrofit で生成されたSSOTは「現状の記録」。
理想の仕様ではなく、既存の動作を記述している。

改善したい場合:
1. まず現状をSSOTに記録（retrofit）
2. 改善案を別SSOTまたはADRに記録
3. リファクタリングタスクとして実装計画に組み込む
4. 段階的に改善（一度に全部変えない）
```

### テストがない場合

```
既存コードにテストがない場合:

1. retrofit と同時にテストを生成
   claude "既存の src/api/auth.ts に対して、
          現在の動作を保証するテストを生成して"

2. テストが通ることを確認
3. SSOTに基づいてリファクタリング
4. テストが引き続き通ることを確認
```

### マイグレーション時の原則

```
■ やること:
  ✅ 既存の動作を壊さない
  ✅ まず現状をSSOTに記録する
  ✅ テストで既存動作を保護してからリファクタ
  ✅ 段階的に進める（一度に全部変えない）
  ✅ Decision Backlog で未決定事項を管理

■ やらないこと:
  ❌ 既存コードを一度に全部書き直す
  ❌ SSOTがない状態でリファクタする
  ❌ テストなしでコードを変更する
  ❌ retrofit を省略してSSOTを手書きする
```

---

## 次のステップ

- フレームワーク全体の概要 → [FRAMEWORK_SUMMARY.md](FRAMEWORK_SUMMARY.md)
- フレームワークの設計思想 → 00_MASTER_GUIDE.md
- SSOT 3層構造の詳細 → 12_SSOT_FORMAT.md
- 品質監査の詳細 → 13_SSOT_AUDIT.md, 17_CODE_AUDIT.md
