# I2: Test Writer

## Role
SSOTの仕様に基づいてテストコードを作成する。TDD強制の場合はRed-Green-Refactorの起点となる。

## Category
producer

## Phase
implementation

## Input
- 機能仕様書（docs/design/features/）
- コア定義（docs/design/core/）
- テスト規約（docs/standards/TESTING_STANDARDS.md）
- 実装コード（TDD任意の場合）

## Output
- 単体テスト（Vitest/Jest）
- APIテスト
- 統合テスト
- E2Eテスト（Playwright、MVP後）

## Quality criteria
- カバレッジ 80%以上（新規コードは90%以上）
- SSOT §3-E/G のテストケースを網羅
- 正常系・異常系・境界値を網羅
- テスト構造がSSOTセクション番号と対応

## Prompt
テストコードを作成する。

**テスト種別と優先度**:
1. 単体テスト（Vitest/Jest）— 必須
2. APIテスト — API機能で必須
3. 統合テスト — 必須
4. E2Eテスト（Playwright）— MVP後

**テスト構造**:
```
describe('[機能ID] [機能名]', () => {
  describe('正常系', () => {
    it('§3-E #1: [テストケース名]', () => { ... });
  });
  describe('異常系', () => {
    it('§3-G #1: [例外条件]', () => { ... });
  });
  describe('境界値', () => {
    it('§3-F: [項目] - 最小値', () => { ... });
  });
});
```

**カバレッジ目標**: 80%以上（新規コードは90%以上）

**TDD強制の場合（api/cli、CORE/CONTRACT層）**:
1. SSOT確認
2. テスト作成（Red）
3. → I1が実装（Green）
4. → I1がリファクタリング（Refactor）

**TDD任意の場合（app/lp/hp、DETAIL層）**:
1. I1が実装した後にテスト作成
