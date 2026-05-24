/**
 * Data Authority / Normalization design validator.
 *
 * Deterministic Gate 1 companion for database and stateful system designs.
 * It prevents mutable facts from being silently duplicated across tables,
 * caches, projections, or runtime registries without an explicit authority
 * model and integrity strategy.
 */

export type DataAuthorityDesignStatus = "PASS" | "WARNING" | "BLOCK";

export interface DataAuthorityDesignDocument {
  path: string;
  content: string;
}

export interface DataAuthorityDesignFinding {
  severity: "BLOCK" | "WARNING";
  path: string;
  type:
    | "missing_section"
    | "missing_canonical_owner"
    | "missing_reference_integrity"
    | "mutable_fact_duplicated"
    | "projection_without_derivation";
  message: string;
}

export interface DataAuthorityDesignResult {
  status: DataAuthorityDesignStatus;
  dataSurfaceDetected: boolean;
  findings: DataAuthorityDesignFinding[];
  checkedDocuments: string[];
}

const DATA_SURFACE_PATH =
  /(SSOT-4_DATA_MODEL|DATA_MODEL|data-model|schema|migration|database|db)/i;

const DATA_SURFACE_TRIGGER =
  /\b(database|db schema|data model|table|tables|column|columns|migration|postgres(?:ql)?|sqlite|sql|foreign key|primary key|unique constraint|referential integrity|registry|identity|routing state|queue state|agent identity|bot identity|provider identity|consumer identity|projection|cache|snapshot|denormaliz(?:e|ed|ation)|state store|store)\b|データベース|DB|テーブル|カラム|マイグレーション|正規化|非正規化|参照整合|外部キー|主キー|一意制約|制約|レジストリ|エージェント.*(?:ID|id|情報)|bot.*(?:ID|id|情報)|ボット.*(?:ID|id|情報)|キュー状態|プロジェクション|キャッシュ|スナップショット/i;

const DATA_AUTHORITY_HEADING =
  /^#{2,4}\s+.*(?:data\s+authority|data\s+ownership|data\s+normalization|normalization|canonical\s+data|data\s+ssot|データ正本|情報正本|データ権威|正規化|正本管理).*/im;

const CANONICAL_OWNER =
  /\b(single source of truth|source of truth|\bssot\b|canonical(?:\s+(?:table|source|owner|record))?|one\s+(?:place|table|source|owner)|no\s+second\s+source|authoritative(?:\s+(?:table|source|record))?)\b|正本|単一(?:の)?(?:情報源|テーブル|所有者)/i;

const REFERENCE_INTEGRITY =
  /\b(foreign key|primary key|unique(?:\s+constraint)?|not null|check constraint|constraint|referential integrity|reference integrity|resolver|migration|cascade|restrict)\b|外部キー|主キー|一意(?:制約)?|NOT NULL|CHECK|制約|参照整合|参照ID|resolver|リゾルバ|マイグレーション/i;

const DUPLICATED_MUTABLE_FACT =
  /(?:store|persist|copy|duplicate|mirror|register|write)[^.\n。]*(?:same information|same fact|mutable fact|agent identity|bot identity|routing status|consumer identity|provider identity|agent id|bot id)[^.\n。]*(?:multiple|several|two|2|tables|places|records)|(?:same information|same fact|mutable fact|agent identity|bot identity|routing status|consumer identity|provider identity|agent id|bot id)[^.\n。]*(?:stored|persisted|copied|duplicated|mirrored|registered|written)[^.\n。]*(?:multiple|several|two|2|tables|places|records)|同じ情報[^。\n]*(?:複数|二つ|2つ|二箇所|2箇所|テーブル)[^。\n]*(?:登録|保存|保持)|(?:agent|bot|エージェント|ボット)[^。\n]*(?:情報|identity|ID|id)[^。\n]*(?:複数|multiple|two|2つ)[^。\n]*(?:テーブル|tables|places)/i;

const PROJECTION_OR_CACHE =
  /\b(projection|cache|snapshot|denormaliz(?:ed|ation)|derived table|materialized view)\b|プロジェクション|キャッシュ|スナップショット|非正規化|派生テーブル/i;

const PROJECTION_DERIVATION =
  /\b(derived|derivation|source|source ref|source_ref|source version|source_version|\bssot\b|canonical|provenance|rebuild|regenerate|invalidate|read-only|readonly|evidence|append-only)\b|派生|正本|ソース|出典|再生成|無効化|証跡|読み取り専用|追記専用|バージョン/i;

const NEGATED_DUPLICATION =
  /\b(?:must\s+not|mustn't|does\s+not|doesn't|do\s+not|don't|never|cannot|can't|should\s+not|shouldn't|forbid(?:den)?|prohibit(?:ed)?|no\s+duplicate|not\s+duplicat(?:e|ed|ion))\b|してはいけない|しない|置かない|重複しない|二重管理しない|禁止|不可/i;

export function validateDataAuthorityDesign(
  documents: DataAuthorityDesignDocument[],
): DataAuthorityDesignResult {
  const checkedDocuments = documents.map((doc) => doc.path);
  const relevant = documents.filter(
    (doc) => DATA_SURFACE_PATH.test(doc.path) || DATA_SURFACE_TRIGGER.test(doc.content),
  );
  const dataSurfaceDetected = relevant.length > 0;
  const findings: DataAuthorityDesignFinding[] = [];

  for (const doc of relevant) {
    const authoritySection = extractSection(doc.content, DATA_AUTHORITY_HEADING);

    if (!authoritySection) {
      findings.push({
        severity: "BLOCK",
        path: doc.path,
        type: "missing_section",
        message: "Missing Data Authority / Normalization section for DB or stateful data design.",
      });
    } else {
      if (!CANONICAL_OWNER.test(authoritySection)) {
        findings.push({
          severity: "BLOCK",
          path: doc.path,
          type: "missing_canonical_owner",
          message:
            "Data Authority / Normalization must identify the canonical owner/SSOT for each mutable fact.",
        });
      }
      if (!REFERENCE_INTEGRITY.test(authoritySection)) {
        findings.push({
          severity: "BLOCK",
          path: doc.path,
          type: "missing_reference_integrity",
          message:
            "Data Authority / Normalization must describe DB/programmatic reference integrity such as PK/FK/UNIQUE/CHECK constraints or resolver boundaries.",
        });
      }
    }

    if (hasNonNegatedMatch(doc.content, DUPLICATED_MUTABLE_FACT, NEGATED_DUPLICATION)) {
      findings.push({
        severity: "BLOCK",
        path: doc.path,
        type: "mutable_fact_duplicated",
        message:
          "Mutable facts must not be stored as independent truth in multiple tables or runtime registries.",
      });
    }

    for (const sentence of splitStatements(doc.content)) {
      if (
        PROJECTION_OR_CACHE.test(sentence) &&
        !PROJECTION_DERIVATION.test(sentence) &&
        !NEGATED_DUPLICATION.test(sentence)
      ) {
        findings.push({
          severity: "BLOCK",
          path: doc.path,
          type: "projection_without_derivation",
          message:
            "Projection/cache/snapshot data must name its source, derivation, invalidation, or regeneration rule.",
        });
      }
    }
  }

  return {
    status: findings.some((finding) => finding.severity === "BLOCK")
      ? "BLOCK"
      : "PASS",
    dataSurfaceDetected,
    findings,
    checkedDocuments,
  };
}

function extractSection(content: string, headingPattern: RegExp): string | null {
  const lines = content.split(/\r?\n/);
  const start = lines.findIndex((line) => headingPattern.test(line));
  if (start < 0) return null;

  const currentLevel = headingLevel(lines[start]) ?? 2;
  const sectionLines = [lines[start]];
  for (let i = start + 1; i < lines.length; i++) {
    const level = headingLevel(lines[i]);
    if (level !== null && level <= currentLevel) break;
    sectionLines.push(lines[i]);
  }
  return sectionLines.join("\n");
}

function headingLevel(line: string): number | null {
  const match = /^(#{1,6})\s+/.exec(line);
  return match ? match[1].length : null;
}

function hasNonNegatedMatch(
  content: string,
  pattern: RegExp,
  negationPattern: RegExp,
): boolean {
  return splitStatements(content).some((sentence) => {
    if (!pattern.test(sentence)) return false;
    return !negationPattern.test(sentence);
  });
}

function splitStatements(content: string): string[] {
  return content
    .split(/(?<=[.!?。！？])\s+|\n+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}
