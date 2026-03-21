/**
 * プロンプト管理システムの型定義
 */

/**
 * プロンプトテンプレートの基本構造
 */
export interface PromptTemplate {
  id: string;
  name: string;
  description: string;
  content: string;
  variables: Variable[];
  tags: string[];
  version: string;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
  isActive: boolean;
  category?: string;
  metadata?: Record<string, unknown>;
}

/**
 * テンプレート内の変数定義
 */
export interface Variable {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'array' | 'object';
  description: string;
  required: boolean;
  default?: string | number | boolean;
  pattern?: string; // 正規表現パターン
  enum?: (string | number)[];
}

/**
 * プロンプト埋め込みリクエスト
 */
export interface RenderRequest {
  templateId: string;
  variables: Record<string, unknown>;
  version?: string;
}

/**
 * プロンプト埋め込み結果
 */
export interface RenderResult {
  templateId: string;
  renderedContent: string;
  usedVariables: Record<string, unknown>;
  version: string;
  timestamp: Date;
}

/**
 * バージョン情報
 */
export interface VersionInfo {
  templateId: string;
  version: string;
  content: string;
  changelog: string;
  createdAt: Date;
  createdBy: string;
}

/**
 * プロンプト作成リクエスト
 */
export interface CreatePromptRequest {
  name: string;
  description: string;
  content: string;
  variables: Variable[];
  tags?: string[];
  category?: string;
  createdBy: string;
}

/**
 * プロンプト更新リクエスト
 */
export interface UpdatePromptRequest {
  name?: string;
  description?: string;
  content?: string;
  variables?: Variable[];
  tags?: string[];
  category?: string;
  updatedBy: string;
  changelog?: string;
}

/**
 * プロンプト検索フィルター
 */
export interface PromptFilter {
  name?: string;
  tags?: string[];
  category?: string;
  isActive?: boolean;
  createdBy?: string;
}

/**
 * API レスポンス（成功）
 */
export interface ApiResponse<T> {
  success: true;
  data: T;
  timestamp: Date;
}

/**
 * API レスポンス（エラー）
 */
export interface ApiErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
  timestamp: Date;
}

/**
 * バリデーション結果
 */
export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

/**
 * バリデーションエラー
 */
export interface ValidationError {
  field: string;
  message: string;
  value?: unknown;
}
