export type MetaSpecLayer = 'spec' | 'impl' | 'verify' | 'ops';

export const META_SPEC_LAYERS: readonly MetaSpecLayer[] = [
  'spec',
  'impl',
  'verify',
  'ops',
] as const;

export interface SpecRepositoryPort {
  list(): Promise<Array<{ path: string; content: string }>>;
  parseFrontmatter(path: string): Promise<{
    id: string[];
    headings: string[];
    metaSpec: boolean;
    metaSpecLayer: MetaSpecLayer;
  }>;
  sectionBody(path: string, heading: string): Promise<string | null>;
}

export interface GitHistoryPort {
  isPreExistingSpec(path: string, baseRef: string): Promise<boolean>;
  fileAtRef(path: string, ref: string): Promise<string | null>;
}

export interface LinkProbePort {
  head(
    url: string,
    opts?: { timeoutMs?: number; retries?: number }
  ): Promise<{ ok: boolean; reason?: string }>;
}

export interface AuditLogPort {
  append(entry: object): Promise<string>;
}

export type CheckName =
  | 'id-uniqueness'
  | 'template-compliance'
  | 'one-id-per-file'
  | 'control-mechanism'
  | 'backward-compat'
  | 'notion-link'
  | 'completion-literal';

export const ALL_CHECKS: readonly CheckName[] = [
  'id-uniqueness',
  'template-compliance',
  'one-id-per-file',
  'control-mechanism',
  'backward-compat',
  'notion-link',
  'completion-literal',
] as const;

export type LinkProbeMode = 'real' | 'fake';

export interface ValidateSpecOptions {
  check?: string | string[];
  strict?: boolean;
  bootstrap?: boolean;
  baseRef?: string;
  linkProbe?: string;
}

export interface Finding {
  check: CheckName | 'usage' | 'port-failure';
  severity: 'fail' | 'warn';
  files: string[];
  message: string;
  line?: number;
}

export interface ValidateSpecResult {
  passed: boolean;
  exit_code: 0 | 2;
  findings: Finding[];
  audit_log_path: string;
}

export interface Ports {
  spec: SpecRepositoryPort;
  git: GitHistoryPort;
  link: LinkProbePort;
  audit: AuditLogPort;
}
