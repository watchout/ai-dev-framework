# ADF v1.2.6 spec proposal — Spec Audit Gate (7 機械検証項目、Gate 0 拡張)

> 作成日: 2026-05-10
> 起票者: ARC (CEO directive `d8331ab9` per、案 (ii) `ed581e09` 採択)

---

## 0. 背景

### 0.1 CEO 採択 7 機械検証項目

[文献確認: CEO `d8331ab9`]:

> 作成したspecに対する監査基準を決定しました。ADF v1.2.0 の framework gate spec にプラスして、下記を追加。

1. SPEC ID 重複なし (既存 ID 群との conflict check)
2. 4 layer template 準拠 (§0-§N の section 揃い)
3. 1 file = 1 spec ID 規約 (or bundle 例外明示)
4. 制御機構選定原則 §10 への準拠 (script vs Hook 選定根拠)
5. 過去 version との backward compatibility check (silent breaking 検出)
6. Notion canonical link の literal 引用 verify
7. completion criteria の literal 化 (ambiguous 表現 warning)

### 0.2 ADF 自反映 (meta-application)

これらは **ADF 自身の spec 起票にも適用**。即ち ADF が自分自身を audit する meta-spec。本日 ARC 反省 patterns (impl 未 verify spec 起草、累積 7+ 件) の structural fix。

### 0.3 鶏卵状態 (bootstrap) 対応

既存 spec (v1.2.0/1/2/3/4/5) は 7 項目に部分違反、本 spec で **Phase 0 grandfather** 規定:
- 既存 spec は warn のみ、新規 spec から strict mode で full enforce
- bootstrap 段階で各 spec を順次 retrofit

### 0.4 案 (ii) 採択 [文献確認: CEO `ed581e09`]

spec doc only PR で先 merge → impl は dev-bot 別 PR (1 PR 1 concern 厳守)。本 proposal も spec doc のみ起票、impl は別 PR。

---

## SPEC-DOC4L-017: Spec Audit Gate (7 機械検証項目)

### 1. 目的

ADF v1.2.0 framework gate spec (`docs/specs/09_ENFORCEMENT.md` Gate 0) に **CEO 採択 7 機械検証項目** を追加し、新規 spec 起票時に script で機械強制。本日 ARC 反省 patterns の structural fix。

### 2. 機能要件

#### 2.1 F1: SPEC ID 重複 check

`framework gate validate spec --check=id-uniqueness`:
- 全 `docs/spec/*.md` の frontmatter `id:` を grep
- 重複検出 → exit 2 (block)

#### 2.2 F2: 4 layer template 準拠 check

`--check=template-compliance`:
- SPEC: §0-§9 (or §11-14、本 PR #133 後)
- IMPL: §0-§9
- VERIFY: §0-§8
- OPS: §0-§10
- section 欠如 → exit 2

#### 2.3 F3: 1 file = 1 spec ID 規約

`--check=one-id-per-file`:
- frontmatter `id:` field が **1 つだけ** 含まれる
- bundle 例外 (例: `SPEC-DOC4L-012-015`) は spec 内に「### Bundle 例外明示」section 必須
- exception section 不在で複数 ID → exit 2

#### 2.4 F4: §10 制御機構選定原則 準拠

`--check=control-mechanism`:
- `## 10. 制御機構選定原則` section 存在確認
- 各 FR について script / Hook 選定根拠記述があるか
- Hook 採用時、不可避 4 case のいずれかを明示
- 不在 / 違反 → exit 2

#### 2.5 F5: backward compatibility check

`--check=backward-compat`:
- 過去 version spec (`docs/spec/*-vN.N.N*.md`) との semantic 比較
- 削除 / 改変 (silent breaking) → exit 2
- 廃止は §0 patch table で明示必須

#### 2.6 F6: Notion canonical link verify

`--check=notion-link`:
- `https://www.notion.so/...` URL を spec から grep
- HEAD 200 OK + `[文献確認: ...]` ラベル付帯確認
- 404 / ラベル不在 → warn (block ではない、URL rot は別 spec)

#### 2.7 F7: completion criteria literal 化

`--check=completion-literal`:
- §「完了条件」 / §「Definition of Done」 section から ambiguous 表現 (regex: `〜程度|〜ぐらい|大体|状況に応じて`) を grep
- 検出 → warn (literal 化推奨)

### 3. インターフェース

```
framework gate validate spec [--check=<name>] [--strict]
  exit 0: 全 check pass
  exit 2: strict mode で 1 つ以上 fail
  --strict: warn を fail に昇格
  --check 指定なし: 全 7 check 実行
```

### 4. 完了条件

- 7 check の CLI 実装完了
- ADF 既存 spec 全件で audit 実行、結果 doc 化
- bootstrap (Phase 0 grandfather) 規定運用
- haishin-puls-hub で 1 週間 dogfood

### 5. 期待効果

| failure mode | 対応 FR | 期待 |
|---|---|---|
| ID 衝突 | F1 | 100% 防止 |
| template drift | F2 | 95%+ |
| 1 file = N ID 暗黙 bundle | F3 | 100% (warn 経由 review) |
| §10 不在 spec | F4 | 100% |
| silent breaking | F5 | 90%+ |
| Notion link rot | F6 | 80%+ (warn level) |
| ambiguous DoD | F7 | dogfood で 5+ 件検出想定 |

---

## ADF への引き渡し条件

- 既存 ADF v1.2.0 Gate 0 (PR #104 merged) を拡張
- ID 体系 SPEC-DOC4L-017 既存 ID 群と衝突なし (016 まで予約済)
- 制御機構: 全 FR が script (CLI / CI gate)、Hook 採用なし
- bootstrap: Phase 0 grandfather で既存 spec retrofit を許容、新規 spec から strict

---

## 改訂履歴

- 2026-05-10: ARC 起票 (CEO `d8331ab9` 採択 + `ed581e09` 案 (ii) GO)
