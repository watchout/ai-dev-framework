/**
 * プロンプト変数埋め込みエンジン テスト
 */

import { describe, it, expect } from 'vitest';
import { PromptRenderer } from './renderer';
import { Variable } from './types';

describe('PromptRenderer', () => {
  const testVariables: Variable[] = [
    { name: 'name', type: 'string', description: 'User name', required: true },
    { name: 'count', type: 'number', description: 'Count', required: true },
    { name: 'active', type: 'boolean', description: 'Is active', required: false },
  ];

  describe('render', () => {
    it('{{variable}} パターンで変数を埋め込める', () => {
      const result = PromptRenderer.render(
        'Hello {{name}}!',
        { name: 'Alice' },
        [{ name: 'name', type: 'string', description: '', required: true }],
      );

      expect(result.renderedContent).toBe('Hello Alice!');
    });

    it('$variable パターンで変数を埋め込める', () => {
      const result = PromptRenderer.render(
        'User: $username',
        { username: 'Bob' },
        [{ name: 'username', type: 'string', description: '', required: true }],
      );

      expect(result.renderedContent).toBe('User: Bob');
    });

    it('複数の変数を埋め込める', () => {
      const result = PromptRenderer.render(
        'Hello {{name}}, you have $count messages',
        { name: 'Charlie', count: 42 },
        [
          { name: 'name', type: 'string', description: '', required: true },
          { name: 'count', type: 'number', description: '', required: true },
        ],
      );

      expect(result.renderedContent).toBe('Hello Charlie, you have 42 messages');
    });

    it('オブジェクト型の変数を JSON に変換する', () => {
      const result = PromptRenderer.render(
        'Data: {{data}}',
        { data: { key: 'value' } },
        [{ name: 'data', type: 'object', description: '', required: true }],
      );

      expect(result.renderedContent).toContain('key');
      expect(result.renderedContent).toContain('value');
    });

    it('配列型の変数を JSON に変換する', () => {
      const result = PromptRenderer.render(
        'Items: {{items}}',
        { items: [1, 2, 3] },
        [{ name: 'items', type: 'array', description: '', required: true }],
      );

      expect(result.renderedContent).toContain('[1,2,3]');
    });

    it('空白を含む変数パターンに対応する', () => {
      const result = PromptRenderer.render(
        'Hello {{ name }}, welcome!',
        { name: 'Diana' },
        [{ name: 'name', type: 'string', description: '', required: true }],
      );

      expect(result.renderedContent).toBe('Hello Diana, welcome!');
    });
  });

  describe('validateVariables', () => {
    it('必須変数が存在する場合、バリデーション成功', () => {
      const result = PromptRenderer.validateVariables(
        { name: 'Alice', count: 5 },
        [
          { name: 'name', type: 'string', description: '', required: true },
          { name: 'count', type: 'number', description: '', required: true },
        ],
      );

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('必須変数が不足している場合、バリデーション失敗', () => {
      const result = PromptRenderer.validateVariables(
        { name: 'Alice' },
        [
          { name: 'name', type: 'string', description: '', required: true },
          { name: 'count', type: 'number', description: '', required: true },
        ],
      );

      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].field).toBe('count');
    });

    it('型が不一致の場合、バリデーション失敗', () => {
      const result = PromptRenderer.validateVariables(
        { count: 'not-a-number' },
        [{ name: 'count', type: 'number', description: '', required: true }],
      );

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.field === 'count')).toBe(true);
    });

    it('パターン（正規表現）マッチング', () => {
      const result = PromptRenderer.validateVariables(
        { email: 'invalid-email' },
        [
          {
            name: 'email',
            type: 'string',
            description: '',
            required: true,
            pattern: '^[^@]+@[^@]+\\.[^@]+$',
          },
        ],
      );

      expect(result.valid).toBe(false);
      expect(result.errors[0].message).toContain('pattern');
    });

    it('列挙値チェック', () => {
      const result = PromptRenderer.validateVariables(
        { status: 'invalid' },
        [
          {
            name: 'status',
            type: 'string',
            description: '',
            required: true,
            enum: ['active', 'inactive', 'pending'],
          },
        ],
      );

      expect(result.valid).toBe(false);
      expect(result.errors[0].message).toContain('must be one of');
    });

    it('オプショナルな変数が省略されている場合、バリデーション成功', () => {
      const result = PromptRenderer.validateVariables(
        { name: 'Alice' },
        [
          { name: 'name', type: 'string', description: '', required: true },
          { name: 'nickname', type: 'string', description: '', required: false },
        ],
      );

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('extractVariables', () => {
    it('{{variable}} パターンの変数を抽出する', () => {
      const variables = PromptRenderer.extractVariables('Hello {{name}}, welcome to {{product}}!');
      expect(variables).toContain('name');
      expect(variables).toContain('product');
      expect(variables).toHaveLength(2);
    });

    it('$variable パターンの変数を抽出する', () => {
      const variables = PromptRenderer.extractVariables('User: $username, Count: $count');
      expect(variables).toContain('username');
      expect(variables).toContain('count');
      expect(variables).toHaveLength(2);
    });

    it('両方のパターンを混在して抽出する', () => {
      const variables = PromptRenderer.extractVariables(
        'Hello {{name}}, your count is $count',
      );
      expect(variables).toContain('name');
      expect(variables).toContain('count');
      expect(variables).toHaveLength(2);
    });

    it('重複する変数は除外される', () => {
      const variables = PromptRenderer.extractVariables(
        'Hello {{name}}, $name is your name',
      );
      expect(variables).toHaveLength(1);
      expect(variables[0]).toBe('name');
    });

    it('変数が存在しない場合、空配列を返す', () => {
      const variables = PromptRenderer.extractVariables('Hello world!');
      expect(variables).toHaveLength(0);
    });
  });
});
