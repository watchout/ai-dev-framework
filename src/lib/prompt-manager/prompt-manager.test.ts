/**
 * プロンプト管理マネージャー テスト
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { PromptManager } from './manager';
import { InMemoryStorage } from './storage';

describe('PromptManager', () => {
  let manager: PromptManager;

  beforeEach(() => {
    const storage = new InMemoryStorage();
    manager = new PromptManager(storage);
  });

  describe('create', () => {
    it('新しいプロンプトテンプレートを作成できる', async () => {
      const template = await manager.create({
        name: 'Test Prompt',
        description: 'Test description',
        content: 'Hello {{name}}, welcome to {{product}}!',
        variables: [
          { name: 'name', type: 'string', description: 'User name', required: true },
          { name: 'product', type: 'string', description: 'Product name', required: true },
        ],
        createdBy: 'test-user',
      });

      expect(template).toBeDefined();
      expect(template.id).toBeDefined();
      expect(template.name).toBe('Test Prompt');
      expect(template.version).toBe('v1.0.0');
      expect(template.isActive).toBe(true);
    });

    it('変数が指定されない場合、テンプレートから自動抽出される', async () => {
      const template = await manager.create({
        name: 'Auto Extract Prompt',
        description: 'Test auto extraction',
        content: 'Hello {{name}}, you have $count messages',
        variables: [],
        createdBy: 'test-user',
      });

      expect(template.variables).toHaveLength(2);
      expect(template.variables.map((v) => v.name).sort()).toEqual(['count', 'name']);
    });

    it('タグとカテゴリを追加できる', async () => {
      const template = await manager.create({
        name: 'Tagged Prompt',
        description: 'With tags and category',
        content: 'Test',
        variables: [],
        tags: ['email', 'greeting'],
        category: 'communication',
        createdBy: 'test-user',
      });

      expect(template.tags).toEqual(['email', 'greeting']);
      expect(template.category).toBe('communication');
    });
  });

  describe('read', () => {
    it('作成したテンプレートを読み込める', async () => {
      const created = await manager.create({
        name: 'Read Test',
        description: 'Test reading',
        content: 'Content',
        variables: [],
        createdBy: 'test-user',
      });

      const read = await manager.read(created.id);
      expect(read).toEqual(created);
    });

    it('存在しないテンプレートを読み込むと null を返す', async () => {
      const read = await manager.read('non-existent-id');
      expect(read).toBeNull();
    });
  });

  describe('update', () => {
    it('テンプレートを更新できる', async () => {
      const created = await manager.create({
        name: 'Original',
        description: 'Original description',
        content: 'Original content',
        variables: [],
        createdBy: 'test-user',
      });

      const updated = await manager.update(created.id, {
        name: 'Updated',
        description: 'Updated description',
        updatedBy: 'test-user',
      });

      expect(updated.name).toBe('Updated');
      expect(updated.description).toBe('Updated description');
      expect(updated.version).toBe('v1.0.1');
    });

    it('更新時にバージョンが自動的にインクリメントされる', async () => {
      const created = await manager.create({
        name: 'Version Test',
        description: 'Test',
        content: 'Content',
        variables: [],
        createdBy: 'test-user',
      });

      const v1 = created.version;

      const updated = await manager.update(created.id, {
        content: 'Updated content',
        updatedBy: 'test-user',
      });

      expect(updated.version).not.toBe(v1);
      expect(updated.version).toBe('v1.0.1');
    });

    it('存在しないテンプレートを更新するとエラーになる', async () => {
      await expect(
        manager.update('non-existent-id', {
          name: 'Updated',
          updatedBy: 'test-user',
        }),
      ).rejects.toThrow('not found');
    });
  });

  describe('delete', () => {
    it('テンプレートを削除できる', async () => {
      const created = await manager.create({
        name: 'Delete Test',
        description: 'Test',
        content: 'Content',
        variables: [],
        createdBy: 'test-user',
      });

      await manager.delete(created.id);
      const read = await manager.read(created.id);
      expect(read).toBeNull();
    });
  });

  describe('list', () => {
    beforeEach(async () => {
      await manager.create({
        name: 'Email Template',
        description: 'Email',
        content: 'Email content',
        variables: [],
        tags: ['email'],
        category: 'communication',
        createdBy: 'user1',
      });

      await manager.create({
        name: 'SMS Template',
        description: 'SMS',
        content: 'SMS content',
        variables: [],
        tags: ['sms'],
        category: 'communication',
        createdBy: 'user2',
      });

      await manager.create({
        name: 'Test Template',
        description: 'Test',
        content: 'Test content',
        variables: [],
        tags: ['test'],
        category: 'testing',
        createdBy: 'user1',
      });
    });

    it('フィルターなしで全テンプレートを取得できる', async () => {
      const templates = await manager.list();
      expect(templates).toHaveLength(3);
    });

    it('名前でフィルターできる', async () => {
      const templates = await manager.list({ name: 'Email' });
      expect(templates).toHaveLength(1);
      expect(templates[0].name).toBe('Email Template');
    });

    it('タグでフィルターできる', async () => {
      const templates = await manager.list({ tags: ['email'] });
      expect(templates).toHaveLength(1);
      expect(templates[0].tags).toContain('email');
    });

    it('カテゴリでフィルターできる', async () => {
      const templates = await manager.list({ category: 'communication' });
      expect(templates).toHaveLength(2);
    });

    it('作成者でフィルターできる', async () => {
      const templates = await manager.list({ createdBy: 'user1' });
      expect(templates).toHaveLength(2);
    });
  });

  describe('render', () => {
    it('テンプレートに変数を埋め込める', async () => {
      const template = await manager.create({
        name: 'Render Test',
        description: 'Test',
        content: 'Hello {{name}}, welcome to {{product}}!',
        variables: [
          { name: 'name', type: 'string', description: 'User name', required: true },
          { name: 'product', type: 'string', description: 'Product name', required: true },
        ],
        createdBy: 'test-user',
      });

      const result = await manager.render({
        templateId: template.id,
        variables: { name: 'Alice', product: 'MyApp' },
      });

      expect(result.renderedContent).toBe('Hello Alice, welcome to MyApp!');
      expect(result.usedVariables).toEqual({ name: 'Alice', product: 'MyApp' });
    });

    it('$ パターンの変数も埋め込める', async () => {
      const template = await manager.create({
        name: 'Dollar Render Test',
        description: 'Test',
        content: 'User: $username, Count: $count',
        variables: [
          { name: 'username', type: 'string', description: '', required: true },
          { name: 'count', type: 'number', description: '', required: true },
        ],
        createdBy: 'test-user',
      });

      const result = await manager.render({
        templateId: template.id,
        variables: { username: 'bob', count: 42 },
      });

      expect(result.renderedContent).toBe('User: bob, Count: 42');
    });

    it('必須変数が不足するとエラーになる', async () => {
      const template = await manager.create({
        name: 'Missing Var Test',
        description: 'Test',
        content: 'Hello {{name}}!',
        variables: [
          { name: 'name', type: 'string', description: '', required: true },
        ],
        createdBy: 'test-user',
      });

      await expect(
        manager.render({
          templateId: template.id,
          variables: {},
        }),
      ).rejects.toThrow('Variable validation failed');
    });

    it('型が不正だとエラーになる', async () => {
      const template = await manager.create({
        name: 'Type Check Test',
        description: 'Test',
        content: 'Count: {{count}}',
        variables: [
          { name: 'count', type: 'number', description: '', required: true },
        ],
        createdBy: 'test-user',
      });

      await expect(
        manager.render({
          templateId: template.id,
          variables: { count: 'not-a-number' },
        }),
      ).rejects.toThrow('Variable validation failed');
    });
  });

  describe('getVersions', () => {
    it('バージョン履歴を取得できる', async () => {
      const created = await manager.create({
        name: 'Version History',
        description: 'Test',
        content: 'v1',
        variables: [],
        createdBy: 'test-user',
      });

      await manager.update(created.id, {
        content: 'v2',
        updatedBy: 'test-user',
      });

      const versions = await manager.getVersions(created.id);
      // 初期バージョンと更新前バージョンが保存される
      expect(versions.length).toBeGreaterThanOrEqual(1);
      expect(versions.some((v) => v.content === 'v1')).toBe(true);
    });
  });

  describe('rollback', () => {
    it('特定のバージョンに戻せる', async () => {
      const created = await manager.create({
        name: 'Rollback Test',
        description: 'Test',
        content: 'v1',
        variables: [],
        createdBy: 'test-user',
      });

      await manager.update(created.id, {
        content: 'v2',
        updatedBy: 'test-user',
      });

      const versions = await manager.getVersions(created.id);
      const targetVersion = versions[0].version;

      const rolledBack = await manager.rollback(created.id, targetVersion, 'test-user');
      expect(rolledBack.content).toBe('v1');
    });
  });
});
