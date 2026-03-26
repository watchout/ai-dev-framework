# .learnings/ — プロジェクト知見蓄積

このディレクトリはGate検出結果・実装中の発見を蓄積し、CLAUDE.mdの自己進化を支援する。

## ファイル構成

| ファイル | 内容 |
|---------|------|
| LEARNINGS.md | 知見の時系列ログ |
| PROMOTION_PROPOSALS.md | CLAUDE.md昇格提案（/self-improve が生成） |

## フロー

```
Gate 2/3 検出 → LEARNINGS.md にGate実行後に記録
実装中の発見 → LEARNINGS.md に手動記録
         ↓
/self-improve → 昇格候補を特定 → PROMOTION_PROPOSALS.md
         ↓
CEO承認 → CLAUDE.md に反映 + LEARNINGS.md に promoted:true
```

## 昇格基準

- 同一カテゴリ3回以上出現
- CRITICAL 2回以上
- Gate 2/3で同一パターン2回以上
