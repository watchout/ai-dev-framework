# Cursor ベース導入ガイド

> 既存資料（README、ペルソナ等）がある状態から、Cursor でフレームワークを導入する手順。

---

## 対象

```
こんな状態のプロジェクト:
  ✅ README.md がある
  ✅ ペルソナ、ユーザーストーリー等の資料がある
  ✅ アイデアは固まっている
  ❌ コードはまだない（または少量）
  ❌ SSOT形式の仕様書はない
```

---

## 重要: 導入の原則

```
■ 1プロンプト = 1ステップ（絶対ルール）

  複数ステップを1つのプロンプトに含めない。
  LLM は「効率化」のつもりでステップを飛ばす傾向がある。
  これを防ぐため、物理的に1ステップずつ進める。

■ 確認 → 承認 → 次へ（ゲート方式）

  各ステップ完了後:
  1. AI が成果物を表示する
  2. ユーザーが内容を確認する
  3. ユーザーが「次へ」と言うまで進まない

■ スキップ禁止

  「まとめて生成」「一括作成」は品質低下の最大原因。
  1ドキュメントずつ、確認を挟んで進める。
```

---

## 導入フロー全体像

```
Prompt 1: フレームワーク構造構築          ← 5分
Prompt 2: 既存資料の棚卸し・分類          ← 10分
Prompt 3: IDEA_CANVAS 生成               ← 10分
Prompt 4: USER_PERSONA 生成              ← 10分
Prompt 5: COMPETITOR_ANALYSIS 生成       ← 10分
Prompt 6: VALUE_PROPOSITION 生成         ← 10分
Prompt 7: PRD 生成                       ← 15分
Prompt 8: FEATURE_CATALOG 生成           ← 15分
Prompt 9: P0機能の詳細ヒアリング開始      ← 機能ごとに15-30分
   ※ P0機能の数だけ Prompt 9 を繰り返す
Prompt 10: 技術設計                      ← 20分
Prompt 11: 開発開始                      ← 開発フェーズへ
```

---

## Prompt 1: フレームワーク構造構築

```
このプロジェクトに AI 開発フレームワークを導入します。

■ フレームワーク参照元
https://github.com/watchout/ai-dev-framework

■ このステップでやること（これだけ。他は何もしない）

1. 以下のディレクトリ構造を作成:
   - docs/idea/
   - docs/requirements/
   - docs/design/core/
   - docs/design/features/common/
   - docs/design/features/project/
   - docs/design/adr/
   - docs/standards/
   - docs/operations/
   - docs/marketing/
   - docs/growth/
   - docs/management/
   - .claude/agents/

2. CLAUDE.md を作成
   ai-dev-framework/templates/project/CLAUDE.md をベースに作成。
   プロジェクト名と概要だけ埋めて、他の {{}} は TBD のまま。

3. Agent Teams テンプレートを .claude/agents/ に配置
   ai-dev-framework/templates/project/agents/ から:
   - visual-tester.md
   - code-reviewer.md
   - ssot-explorer.md

4. .gitignore を作成

5. 作成したファイル一覧を表示

■ 禁止事項
- 既存ファイルを移動・変更しない
- 仕様書やドキュメントの中身を生成しない
- 次のステップに進まない
```

---

## Prompt 2: 既存資料の棚卸し

```
フレームワーク導入の Step 2 です。

■ やること（これだけ）

1. このリポジトリ内の全 .md ファイルと資料を読み込む

2. 各資料を以下のカテゴリに分類して表を作成:

   | ファイル | 内容要約 | 対応するSSOT | 活用度 |
   |---------|---------|-------------|--------|
   | README.md | ... | IDEA_CANVAS, PRD | 高 |
   | persona.md | ... | USER_PERSONA | 高 |
   | ... | ... | ... | ... |

   活用度:
   - 高: そのまま SSOT に変換可能
   - 中: 一部情報が使える
   - 低: 参考程度

3. 不足している情報を一覧で表示:
   「以下の情報が既存資料にありません:
    - 競合分析
    - 収益モデルの詳細
    - ...」

4. 表示して確認を待つ

■ 禁止事項
- ドキュメントを生成しない（分類と分析だけ）
- 次のステップに進まない
```

---

## Prompt 3: IDEA_CANVAS 生成

```
フレームワーク導入の Step 3 です。

■ 参照
- テンプレート: ai-dev-framework/templates/idea/IDEA_CANVAS.md
- 既存資料: [Step 2 で特定した関連ファイルを列挙]

■ やること

1. 既存資料の関連情報を読み込む
2. IDEA_CANVAS.md のテンプレートに沿って docs/idea/IDEA_CANVAS.md を生成
3. 既存資料にない項目は「[要確認]」マーカーを付ける
4. 生成結果を表示する
5. [要確認] 項目があれば、1つずつ質問する（一度に複数質問しない）

■ 禁止事項
- 他のドキュメントを生成しない
- [要確認] を勝手に埋めない（必ず質問する）
- 次のステップに進まない

■ 完了条件
- IDEA_CANVAS.md が docs/idea/ に保存されている
- [要確認] が全て解消されている
- ユーザーが内容を承認している
```

---

## Prompt 4: USER_PERSONA 生成

```
フレームワーク導入の Step 4 です。

■ 参照
- テンプレート: ai-dev-framework/templates/idea/USER_PERSONA.md
- インプット: docs/idea/IDEA_CANVAS.md（Step 3 で作成済み）
- 既存資料: [ペルソナ関連の既存ファイルを列挙]

■ やること

1. IDEA_CANVAS.md と既存ペルソナ資料を読み込む
2. USER_PERSONA.md を生成（docs/idea/USER_PERSONA.md）
3. 既存資料にない項目は「[要確認]」マーカーを付ける
4. 生成結果を表示する
5. [要確認] 項目があれば、1つずつ質問する

■ 禁止事項
- 他のドキュメントを生成しない
- [要確認] を勝手に埋めない
- 次のステップに進まない

■ 完了条件
- USER_PERSONA.md が保存されている
- [要確認] が全て解消されている
- ユーザーが承認している
```

---

## Prompt 5: COMPETITOR_ANALYSIS 生成

```
フレームワーク導入の Step 5 です。

■ 参照
- テンプレート: ai-dev-framework/templates/idea/COMPETITOR_ANALYSIS.md
- インプット: docs/idea/IDEA_CANVAS.md, docs/idea/USER_PERSONA.md
- 既存資料: [競合関連の既存ファイルがあれば列挙]

■ やること

1. 前ステップの成果物と既存資料を読み込む
2. COMPETITOR_ANALYSIS.md を生成（docs/idea/）
3. 既存資料にない項目は「[要確認]」マーカー
4. 生成結果を表示 → [要確認] を1つずつ質問

■ 禁止事項・完了条件: 前ステップと同じ
```

---

## Prompt 6: VALUE_PROPOSITION 生成

```
フレームワーク導入の Step 6 です。

■ 参照
- テンプレート: ai-dev-framework/templates/idea/VALUE_PROPOSITION.md
- インプット: docs/idea/ の全ドキュメント（IDEA_CANVAS, PERSONA, COMPETITOR）

■ やること

1. docs/idea/ の3ドキュメントを全て読み込む
2. VALUE_PROPOSITION.md を生成（docs/idea/）
3. [要確認] マーカー → 1つずつ質問
4. 生成結果を表示して確認を待つ

■ 禁止事項・完了条件: 前ステップと同じ

■ ゲートチェック（Step 6 完了時）
以下の4ファイルが全て存在し、[要確認] がゼロであること:
- docs/idea/IDEA_CANVAS.md
- docs/idea/USER_PERSONA.md
- docs/idea/COMPETITOR_ANALYSIS.md
- docs/idea/VALUE_PROPOSITION.md
→ 全て確認できたら「事業設計フェーズ完了」と表示
```

---

## Prompt 7: PRD 生成

```
フレームワーク導入の Step 7 です。

■ 参照
- フォーマット: ai-dev-framework/12_SSOT_FORMAT.md
- インプット: docs/idea/ の全ドキュメント
- 既存資料: [要件に関する既存ファイルがあれば列挙]

■ やること

1. docs/idea/ の4ドキュメントを全て読み込む
2. SSOT-0_PRD.md を生成（docs/requirements/）
3. SSOT 3層構造（CORE/CONTRACT/DETAIL）に従う
4. CORE層とCONTRACT層を重点的に確定する
5. [要確認] マーカー → 1つずつ質問
6. 生成結果を表示して確認を待つ

■ 禁止事項
- FEATURE_CATALOG は生成しない（次のステップ）
- [要確認] を勝手に埋めない
- 次のステップに進まない
```

---

## Prompt 8: FEATURE_CATALOG 生成

```
フレームワーク導入の Step 8 です。

■ 参照
- フォーマット: ai-dev-framework/12_SSOT_FORMAT.md
- インプット: docs/requirements/SSOT-0_PRD.md

■ やること

1. PRD を読み込む
2. SSOT-1_FEATURE_CATALOG.md を生成（docs/requirements/）
3. 各機能に ID を付与（例: EVT-001, USR-001）
4. 優先度を P0/P1/P2 で分類
5. P0 機能を明確にリストする
6. 生成結果を表示して確認を待つ

■ 確認事項（ユーザーに必ず聞く）
- P0 機能のリストは正しいか？
- 不足している機能はないか？
- 優先度の変更はあるか？

■ 禁止事項
- 機能の詳細仕様（SSOT）を生成しない（次のステップ）
- 次のステップに進まない

■ ゲートチェック（Step 8 完了時）
以下が確認できたら「プロダクト概要フェーズ完了」と表示:
- docs/requirements/SSOT-0_PRD.md が存在
- docs/requirements/SSOT-1_FEATURE_CATALOG.md が存在
- P0 機能リストがユーザー承認済み
→ 「次は P0 機能ごとの詳細ヒアリングです。1機能ずつ進めます。」
```

---

## Prompt 9: P0 機能の詳細ヒアリング（機能ごとに繰り返す）

```
フレームワーク導入の Step 9 です。
P0 機能を1つずつ詳細化して SSOT を作成します。

■ 対象機能
[機能ID]: [機能名]
（例: EVT-001: ゴールベースイベント作成）

■ 参照
- ヒアリングプロセス: ai-dev-framework/11_FEATURE_SPEC_FLOW.md
- SSOT フォーマット: ai-dev-framework/12_SSOT_FORMAT.md
- 共通機能テンプレート: ai-dev-framework/common-features/

■ やること（11_FEATURE_SPEC_FLOW.md に従う）

Phase A: 機能の分類
  - この機能は共通機能か固有機能か判定
  - 共通機能なら ai-dev-framework/common-features/ からテンプレート取得
  - 固有機能なら以下の Phase B へ

Phase B: ヒアリング（1問ずつ。まとめて聞かない）
  1. この機能の主要なユーザーフローを確認
     「[機能名] の典型的な操作フローを教えてください。
      例: ○○画面を開く → △△を入力 → □□ボタンを押す → 結果が表示される」

  2. ビジネスルールを確認
     「この機能で守るべきビジネスルールはありますか？
      例: 1ユーザーあたり最大10件まで、○○の場合は△△が必要」

  3. 画面構成を確認
     「この機能の画面イメージを教えてください。
      どんな入力項目があり、どんな表示がありますか？」

  4. エラーケースを確認
     「想定されるエラーや異常系はありますか？
      例: 入力値不正、権限なし、タイムアウト」

  5. 他機能との関連を確認
     「この機能は他のどの機能と連携しますか？」

Phase C: SSOT 生成
  - ヒアリング結果を SSOT 形式で生成
  - docs/design/features/project/[機能ID]_[名前].md に保存
  - Freeze 2（CONTRACT層）まで確定
  - DETAIL層は [後決定] マーカーで OK

Phase D: 確認
  - 生成した SSOT を表示
  - ユーザーが承認するまで修正

■ 禁止事項
- 複数の質問を同時にしない（1問ずつ）
- ヒアリングをスキップして仕様を推測しない
- 他の機能の SSOT を生成しない（1機能ずつ）
- 次の機能に進まない（ユーザーが「次へ」と言うまで）

■ 完了条件
- [機能ID] の SSOT ファイルが保存されている
- Freeze 2 まで確定している
- ユーザーが承認している
→ 「[機能ID] 完了。次の P0 機能に進みますか？」
```

**この Prompt 9 を P0 機能の数だけ繰り返します。**

---

## Prompt 10: 技術設計

```
フレームワーク導入の Step 10 です。

■ ゲートチェック（開始前に確認）
以下が全て存在することを確認してから開始:
- docs/idea/ に 4ドキュメント
- docs/requirements/ に PRD + FEATURE_CATALOG
- docs/design/features/ に P0 機能の SSOT 全て
→ 不足があれば報告して停止

■ 参照
- ai-dev-framework/10_GENERATION_CHAIN.md（Step 3: Technical）

■ やること（1ドキュメントずつ、確認を挟む）

1. docs/standards/TECH_STACK.md を生成
   → ユーザー確認を待つ

2. docs/design/core/SSOT-3_API_CONTRACT.md を生成
   → ユーザー確認を待つ

3. docs/design/core/SSOT-4_DATA_MODEL.md を生成
   → ユーザー確認を待つ

4. docs/design/core/SSOT-5_CROSS_CUTTING.md を生成
   → ユーザー確認を待つ

5. docs/standards/CODING_STANDARDS.md を生成
   → ユーザー確認を待つ

6. CLAUDE.md の {{}} を全て確定値で更新

■ 禁止事項
- 全ドキュメントを一括生成しない（1つずつ）
- 確認を取らずに次のドキュメントに進まない
```

---

## Prompt 11: 開発開始

```
フレームワーク導入の最終ステップです。

■ やること

1. docs/management/IMPLEMENTATION_PLAN.md を作成
   - 14_IMPLEMENTATION_ORDER.md に基づいてタスク分解
   - 縦スライス × Wave で実装順序を決定

2. .github/workflows/ci.yml を作成
   - 19_CI_PR_STANDARDS.md に基づく

3. プロジェクトのスキャフォールド
   - package.json, tsconfig.json 等
   - src/ ディレクトリ構造

4. 実装計画を表示して確認

5. 「Wave 1 の最初の機能から実装を開始しますか？」と聞く

■ 禁止事項
- 確認なしで実装を開始しない
```

---

## トラブルシューティング

### LLM がステップを飛ばそうとする場合

以下を追加で貼ってください:

```
重要: あなたは今 Step [N] だけを実行しています。
Step [N+1] 以降は絶対に実行しないでください。
このステップの完了条件を満たしたら、
結果を表示して私の確認を待ってください。
```

### LLM が一括生成しようとする場合

```
停止してください。1ドキュメントずつ生成し、
各ドキュメントの生成後に私の確認を取ってから
次のドキュメントに進んでください。
まず [ドキュメント名] だけを生成してください。
```

### セッションが長くなった場合

```
ここまでの作業内容を要約して、
次のセッションで使える引き継ぎプロンプトを作成して。
現在のステップ番号と、完了済み/未完了のドキュメント一覧を含めて。
```

---

## チェックリスト

### Phase 1（構造構築）完了時 - Prompt 1-2

- [ ] docs/ ディレクトリ構造が作成されている
- [ ] CLAUDE.md が配置されている
- [ ] .claude/agents/ に 3 エージェントが配置されている
- [ ] 既存資料の分類表が作成・確認済み

### Phase 2（事業設計）完了時 - Prompt 3-6

- [ ] docs/idea/IDEA_CANVAS.md — [要確認] ゼロ、承認済み
- [ ] docs/idea/USER_PERSONA.md — [要確認] ゼロ、承認済み
- [ ] docs/idea/COMPETITOR_ANALYSIS.md — [要確認] ゼロ、承認済み
- [ ] docs/idea/VALUE_PROPOSITION.md — [要確認] ゼロ、承認済み

### Phase 3（プロダクト設計）完了時 - Prompt 7-9

- [ ] docs/requirements/SSOT-0_PRD.md — 承認済み
- [ ] docs/requirements/SSOT-1_FEATURE_CATALOG.md — P0 リスト承認済み
- [ ] P0 機能の SSOT が全て docs/design/features/ に存在
- [ ] 各 SSOT が Freeze 2 まで確定

### Phase 4（技術設計・開発開始）完了時 - Prompt 10-11

- [ ] docs/standards/TECH_STACK.md — 承認済み
- [ ] docs/design/core/ に SSOT-3, 4, 5 — 各承認済み
- [ ] CLAUDE.md の {{}} が全て確定値
- [ ] CI/CD が設定されている
- [ ] 実装計画が作成されている
