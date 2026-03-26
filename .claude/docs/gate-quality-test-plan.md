# Gate 2 Quality Sweep — haishin-puls-hub テスト手順書

## 1. Gate 2関連ファイルのコピー

```bash
# haishin-puls-hubに移動
cd ~/Developer/haishin-puls-hub

# Validatorをコピー
mkdir -p .claude/agents/validators
cp ~/Developer/ai-dev-framework/.claude/agents/validators/ssot-drift-detector.md .claude/agents/validators/
cp ~/Developer/ai-dev-framework/.claude/agents/validators/security-scanner.md .claude/agents/validators/
cp ~/Developer/ai-dev-framework/.claude/agents/validators/test-coverage-auditor.md .claude/agents/validators/
cp ~/Developer/ai-dev-framework/.claude/agents/validators/perf-profiler.md .claude/agents/validators/

# Gate定義をコピー
mkdir -p .claude/gates
cp ~/Developer/ai-dev-framework/.claude/gates/quality-sweep.md .claude/gates/

# gate-qualityスキルをコピー
mkdir -p .claude/skills/gate-quality
cp ~/Developer/ai-dev-framework/.claude/skills/gate-quality/SKILL.md .claude/skills/gate-quality/
```

## 2. Wave 1の次のfeatureでGate 2を通す手順

```bash
# 1. featureブランチで実装完了後
git add -A && git commit -m "feat: implement [feature-id]"

# 2. コンテキスト収集
framework gate quality

# 3. Validator実行（Claude Codeセッション内で）
/gate-quality

# 4. 結果確認
cat .framework/reports/quality-sweep-*.md
```

## 3. PASS/BLOCK両方を意図的に試す方法

### PASSを試す
- 正常に実装されたfeatureでGate 2を実行
- 全テストがパスし、SSOT準拠であることを確認

### BLOCKを試す（CRITICAL発生）
```typescript
// 意図的にSQLi脆弱性を追加（security-scannerがCRITICAL検出）
const query = `SELECT * FROM users WHERE id = '${userId}'`;

// 意図的にSSOT乖離を発生（ssot-drift-detectorがCRITICAL検出）
// SSOTで定義されたAPIレスポンス型と異なる型を返す
```

### BLOCKを試す（WARNING超過）
```typescript
// 意図的にパフォーマンス問題を追加（perf-profilerがWARNING検出）
for (const user of users) {
  const profile = await db.profile.findUnique({ where: { userId: user.id } });
}

// テストなしの機能追加（test-coverage-auditorがWARNING検出）
```

## 4. フィードバック記録方法

Gate 2実行後、以下のフォーマットでフィードバックを記録:

```markdown
# Gate 2 Feedback — [date]

## 実行環境
- Project: haishin-puls-hub
- Feature: [feature-id]
- Branch: [branch-name]

## 結果
- Verdict: PASS / BLOCK
- CRITICAL: X件
- WARNING: X件

## フィードバック
### 偽陽性（False Positive）
- [Validator名]: [指摘内容] → 実際は問題なし。理由: [...]

### 偽陰性（False Negative）
- [見逃された問題]: [詳細]

### Prompt改善提案
- [Validator名]: [改善案]

## 所要時間
- コンテキスト収集: Xmin
- Validator実行: Xmin
- 修正（BLOCK時）: Xmin
```

保存先: `.framework/feedback/gate-quality-feedback-{date}.md`
