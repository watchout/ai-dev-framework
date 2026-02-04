# 知識データ一覧（Knowledge Base Index）

> プロジェクトのドメイン知識・市場知識・ユーザー知識を蓄積する。
> Discovery やSSOT生成時に参照し、仕様の品質を高める。

---

## 使い方

```
1. Discovery 開始前に docs/knowledge/ を確認する
2. 関連する知識があれば読み込んでからヒアリングを開始
3. Discovery / SSOT生成中に知識データを根拠として引用
4. 新しい知識を得たら該当ファイルに追記
```

## 参照タイミング

| フェーズ | 参照する知識 | 目的 |
|---------|------------|------|
| Discovery Stage 1 (課題) | users/pain-points.md, users/interviews.md | 課題の深掘り |
| Discovery Stage 2 (ターゲット) | users/personas.md | ペルソナ精緻化 |
| Discovery Stage 3 (価値) | market/competitors.md, domain/best-practices.md | 差別化 |
| Discovery Stage 4 (機能) | domain/common-features.md, domain/terminology.md | 業界標準の把握 |
| Discovery Stage 5 (ビジネス) | market/trends.md, market/regulations.md | 市場機会・制約 |
| SSOT生成 | 全知識データ | 仕様への反映 |

## ファイル一覧

### market/（市場知識）

| ファイル | 内容 | 更新頻度 |
|---------|------|---------|
| competitors.md | 競合分析（強み・弱み・ポジショニング） | 月次 |
| trends.md | 市場トレンド（技術・ビジネス・ユーザー行動） | 月次 |
| regulations.md | 規制・法令（準拠すべきルール） | 変更時 |

### domain/（ドメイン知識）

| ファイル | 内容 | 更新頻度 |
|---------|------|---------|
| terminology.md | 業界用語・定義 | 随時 |
| best-practices.md | ベストプラクティス・設計パターン | 随時 |
| common-features.md | 業界標準機能（あって当然の機能） | 随時 |

### users/（ユーザー知識）

| ファイル | 内容 | 更新頻度 |
|---------|------|---------|
| personas.md | 詳細ペルソナ（行動・動機・課題） | 四半期 |
| pain-points.md | 課題詳細（深掘り・優先順位） | 随時 |
| interviews.md | インタビュー記録（生の声） | 実施ごと |

---

## 知識データの品質基準

```
各ファイルに以下のメタデータを記載すること:

- 最終更新日
- 情報源（URL、書籍名、インタビュー日等）
- 確信度（High: 一次情報 / Med: 二次情報 / Low: 推測）
- 次回更新予定日
```

## AI向け参照ルール

```
1. Discovery開始前: docs/knowledge/ の存在を確認
   → 存在する → 関連ファイルを読み込んでからヒアリング開始
   → 存在しない → 通常通りヒアリング開始

2. 提案時: 知識データの根拠を示す
   → 「知識データ（competitors.md）によると、競合Aは○○を提供しています」
   → 「業界標準（common-features.md）では○○機能が一般的です」

3. 不足時: 追加を推奨する
   → 「この分野の情報は知識データにありません。追加を推奨します」

4. 矛盾時: 報告する
   → 「ユーザーの回答と知識データ（pain-points.md）に矛盾があります」
```
