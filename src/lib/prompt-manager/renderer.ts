/**
 * プロンプト変数埋め込みエンジン
 */

import { Variable, RenderRequest, RenderResult, ValidationResult, ValidationError } from './types.js';

export class PromptRenderer {
  /**
   * テンプレートに変数を埋め込む
   */
  static render(
    content: string,
    variables: Record<string, unknown>,
    templateVariables: Variable[],
  ): RenderResult {
    // バリデーション
    const validation = this.validateVariables(variables, templateVariables);
    if (!validation.valid) {
      throw new Error(`Variable validation failed: ${validation.errors.map((e: ValidationError) => e.message).join(', ')}`);
    }

    let rendered = content;

    // 変数を埋め込む（{{variableName}} または $variableName）
    for (const [key, value] of Object.entries(variables)) {
      const stringValue = this.formatValue(value);
      // {{variableName}} パターン
      rendered = rendered.replace(new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, 'g'), stringValue);
      // $variableName パターン
      rendered = rendered.replace(new RegExp(`\\$${key}\\b`, 'g'), stringValue);
    }

    return {
      templateId: '',
      renderedContent: rendered,
      usedVariables: variables,
      version: '1.0.0',
      timestamp: new Date(),
    };
  }

  /**
   * 変数をバリデーションする
   */
  static validateVariables(
    variables: Record<string, unknown>,
    templateVariables: Variable[],
  ): ValidationResult {
    const errors: ValidationError[] = [];

    // 必須変数チェック
    for (const variable of templateVariables) {
      if (variable.required && !(variable.name in variables)) {
        errors.push({
          field: variable.name,
          message: `Required variable "${variable.name}" is missing`,
        });
      }
    }

    // 型チェック
    for (const variable of templateVariables) {
      if (!(variable.name in variables)) continue;

      const value = variables[variable.name];
      const actualType = this.getValueType(value);

      if (actualType !== variable.type) {
        errors.push({
          field: variable.name,
          message: `Variable "${variable.name}" should be of type ${variable.type}, got ${actualType}`,
          value,
        });
      }

      // パターン（正規表現）チェック
      if (variable.pattern && typeof value === 'string') {
        const pattern = new RegExp(variable.pattern);
        if (!pattern.test(value)) {
          errors.push({
            field: variable.name,
            message: `Variable "${variable.name}" does not match pattern "${variable.pattern}"`,
            value,
          });
        }
      }

      // 列挙値チェック
      if (variable.enum && !variable.enum.includes(value as string | number)) {
        errors.push({
          field: variable.name,
          message: `Variable "${variable.name}" must be one of ${variable.enum.join(', ')}, got ${value}`,
          value,
        });
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * 値の型を判定する
   */
  private static getValueType(value: unknown): string {
    if (Array.isArray(value)) return 'array';
    if (value === null) return 'null';
    return typeof value;
  }

  /**
   * 値を文字列にフォーマットする
   */
  private static formatValue(value: unknown): string {
    if (value === null || value === undefined) {
      return '';
    }
    if (typeof value === 'object') {
      return JSON.stringify(value);
    }
    return String(value);
  }

  /**
   * テンプレート内の全変数を抽出する
   */
  static extractVariables(content: string): string[] {
    const variables = new Set<string>();

    // {{variableName}} パターンを抽出
    const doubleBracePattern = /\{\{\s*(\w+)\s*\}\}/g;
    let match;
    while ((match = doubleBracePattern.exec(content)) !== null) {
      variables.add(match[1]);
    }

    // $variableName パターンを抽出
    const dollarPattern = /\$(\w+)\b/g;
    while ((match = dollarPattern.exec(content)) !== null) {
      variables.add(match[1]);
    }

    return Array.from(variables);
  }
}
