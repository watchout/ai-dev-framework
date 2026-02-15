# 各プロジェクト用 フレームワーク v3.4 運用開始プロンプト

> 各プロジェクトの Claude Code セッションで実行するプロンプト。
> 上から順にコピペして使う。Gate が全て passed になるまで進める。

---

## 1. hotel-kanri

### 現状
- Gate A: failed / Gate B: passed / Gate C: failed
- SSOT: `docs/03_ssot/` に 40+ ファイル（独自レイアウト）
- Husky: あり（spectral + semgrep + SSOT link check）
- Claude hooks: インストール済み（env, mcpServers, SessionStart 保持）

### Prompt 1-1: Gate A（開発環境チェック）

```
hotel-kanri の Pre-Code Gate A を通過させたい。

CLAUDE.md の Gate A 定義を読んで、以下を確認・修正して：
1. docker-compose.yml が存在し DB/Redis コンテナが起動できるか
2. .env.example が存在し必要な環境変数が定義されているか
3. pnpm install が成功するか
4. pnpm db:migrate が成功するか（Prisma）
5. pnpm dev でローカル開発サーバーが起動するか
6. .github/workflows/ci.yml が配置されているか

不足があれば修正して、最後に `framework gate check-a` を実行。
```

### Prompt 1-2: Gate C（SSOT 品質監査）

```
hotel-kanri の Pre-Code Gate C を通過させたい。

`framework audit ssot` を実行して、docs/03_ssot/00_foundation/ の
主要 SSOT の §3-E/F/G/H の充足状況を確認して。

優先順位：
1. SSOT_SAAS_ADMIN_AUTHENTICATION.md
2. SSOT_SAAS_DATABASE_SCHEMA.md
3. SSOT_API_REGISTRY.md

各ファイルの不足セクション（§3-E 入出力例、§3-F 境界値、
§3-G 例外応答、§3-H Gherkin）を補完して。

補完後、`framework gate check-c` を実行。
```

---

## 2. haishin-plus-hub

### 現状
- Gate A: passed / Gate B: failed / Gate C: failed
- SSOT: `docs/design/core/` + `docs/design/features/` （v3.4 標準構造）
- Husky: あり（lint-staged + commitlint）
- Claude hooks: インストール済み

### Prompt 2-1: Gate B（計画作成）

```
haishin-plus-hub の Pre-Code Gate B を通過させたい。

`framework plan` を実行して実装計画を作成して。

前提：
- docs/design/features/ の common/ と project/ 配下の全 SSOT を分析
- 依存関係 → Wave 分類 → 実装順序を決定
- GitHub Issues の作成候補を出力

plan 完了後、Gate B は自動で passed になる。
`framework gate status` で確認して。
```

### Prompt 2-2: Gate C（SSOT 品質監査）

```
haishin-plus-hub の Pre-Code Gate C を通過させたい。

`framework audit ssot` を実行して、以下の優先順で
§3-E/F/G/H の充足状況を確認して：

1. docs/design/core/SSOT-3_API_CONTRACT.md
2. docs/design/core/SSOT-4_DATA_MODEL.md
3. docs/design/core/SSOT-5_CROSS_CUTTING.md
4. docs/design/features/common/ の主要ファイル

不足セクションを補完して、`framework gate check-c` を実行。
```

---

## 3. wbs

### 現状
- Gate A: failed / Gate B: failed / Gate C: failed
- SSOT: `docs/` にフラットに散在 + `docs/core/`, `docs/ssot/`
- Husky: なし（新規作成済み）
- Claude hooks: インストール済み

### Prompt 3-1: Gate A（開発環境チェック）

```
wbs の Pre-Code Gate A を通過させたい。

CLAUDE.md の Gate A 定義を読んで、以下を確認・修正して：
1. docker-compose.yml が存在し DB コンテナが起動できるか
2. .env.example が存在し必要な環境変数が定義されているか
3. pnpm install が成功するか
4. DB マイグレーションが成功するか
5. pnpm dev でローカル開発サーバーが起動するか
6. CI 設定が存在するか

不足があれば修正して、最後に `framework gate check-a` を実行。
```

### Prompt 3-2: Gate B（計画作成）

```
wbs の Pre-Code Gate B を通過させたい。

`framework plan` を実行して実装計画を作成して。

前提：
- docs/ 配下の全 SSOT（SSOT_*.md）を分析
- docs/core/, docs/ssot/ も含める
- 依存関係 → Wave 分類 → 実装順序を決定

plan 完了後、`framework gate status` で確認。
```

### Prompt 3-3: Gate C（SSOT 品質監査）

```
wbs の Pre-Code Gate C を通過させたい。

`framework audit ssot` を実行して、主要 SSOT の
§3-E/F/G/H の充足状況を確認して。

wbs の SSOT は docs/ にフラットに配置されている。
優先順位の高いファイルから補完して。

補完後、`framework gate check-c` を実行。
```

---

## 4. iyasaka

### 現状
- Gate A: failed / Gate B: failed / Gate C: failed
- SSOT: `docs/idea/IDEA_CANVAS.md` + `docs/design/core/` （最小限）
- Husky: なし（新規作成済み）
- Claude hooks: インストール済み
- ディスカバリーフロー未実施

### Prompt 4-0: ディスカバリー（Gate 前の前提作業）

```
iyasaka はまだディスカバリーフローが完了していない。
PRD 等の仕様書が不足している。

docs/idea/IDEA_CANVAS.md を読んで現状を把握した上で、
`framework discover` を実行してヒアリングを開始して。

※ 1問ずつ質問して。まとめて聞かない。
```

### Prompt 4-1: Gate A（開発環境チェック）

```
iyasaka の Pre-Code Gate A を通過させたい。

CLAUDE.md の Gate A 定義を読んで、以下を確認・修正して：
1. package.json が存在するか
2. pnpm install が成功するか
3. 開発サーバーが起動するか（Nuxt/Vue）
4. .env.example が存在するか
5. Supabase の接続設定が正しいか

不足があれば修正して、最後に `framework gate check-a` を実行。
```

### Prompt 4-2: Gate B（計画作成）

```
iyasaka の Pre-Code Gate B を通過させたい。

ディスカバリーで生成された SSOT を元に
`framework plan` を実行して実装計画を作成して。

plan 完了後、`framework gate status` で確認。
```

### Prompt 4-3: Gate C（SSOT 品質監査）

```
iyasaka の Pre-Code Gate C を通過させたい。

`framework audit ssot` を実行して、
docs/design/core/ の SSOT の §3-E/F/G/H を確認。

不足セクションを補完して、`framework gate check-c` を実行。
```

---

## 全プロジェクト共通: Gate 通過確認プロンプト

```
`framework gate status` を実行して、全 Gate の状態を表示して。
未通過の Gate があれば、何が必要か説明して。
```

## 全プロジェクト共通: Gate 通過後の開発開始プロンプト

```
全 Gate が passed であることを確認した上で、
次に実装すべき機能を `framework status` で確認して。
FRAMEWORK_v34_OPERATIONS.md の Step 5 に従って開発を進めて。
```
