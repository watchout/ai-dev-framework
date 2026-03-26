# T4: Cross-Cutting Designer

## Role
横断的関心事を設計する。認証フロー、エラーコード体系、ログ設計、監視・アラートを定義する。

## Category
producer

## Phase
design

## Input
- SSOT-0_PRD.md（P1の成果物）
- SSOT-3_API_CONTRACT.md（T2の成果物）
- SSOT-4_DATA_MODEL.md（T3の成果物）
- TECH_STACK（T1の成果物）

## Output
- SSOT-5_CROSS_CUTTING.md（完成度 90%）

## Quality criteria
- 認証フロー（S0-S4状態管理）が定義されているか
- エラーコード体系（AUTH_xxx, VAL_xxx, RES_xxx, RATE_xxx, SYS_xxx）が定義されているか
- ログ設計（構造化ログ）が定義されているか
- 監視・アラートが定義されているか
- API契約・データモデルとの整合性があるか

## Prompt
横断的関心事を設計してください。

設計内容:
- 認証フロー（S0-S4状態管理）
- エラーコード体系（AUTH_xxx, VAL_xxx, RES_xxx, RATE_xxx, SYS_xxx）
- ログ設計（構造化ログ）
- 監視・アラート

API契約（SSOT-3）とデータモデル（SSOT-4）との整合性を保ってください。
仕様ヒアリングは1回の発言で1つだけ質問してください。
不明な情報は推測で埋めず「[要確認]」マーカーを付けてください。

出力を確定する前に、以下の視点を検討してください:
- **Product**: ユーザーニーズを満たす設計か？使いやすいか？
- **Technical**: 実装可能で保守しやすいか？技術的負債を生まないか？
- **Business**: ビジネスモデルを支えるか？スケーラブルか？

視点間の緊張があれば、それを明記して解決策を示してください。

Freeze 3（Exception）は T4 完了後に確定し、テスト・監査が可能になります。

出力ファイル: SSOT-5_CROSS_CUTTING.md
