/**
 * プロンプト管理マネージャー（CRUD + バージョン管理）
 */

import { randomUUID } from 'crypto';
import {
  PromptTemplate,
  CreatePromptRequest,
  UpdatePromptRequest,
  PromptFilter,
  RenderRequest,
  RenderResult,
  VersionInfo,
} from './types';
import { StorageAdapter, InMemoryStorage } from './storage';
import { PromptRenderer } from './renderer';

export class PromptManager {
  private storage: StorageAdapter;
  private readonly versionPrefix = 'v';

  constructor(storage?: StorageAdapter) {
    this.storage = storage || new InMemoryStorage();
  }

  /**
   * 新しいプロンプトテンプレートを作成する
   */
  async create(request: CreatePromptRequest): Promise<PromptTemplate> {
    const id = randomUUID();
    const now = new Date();

    // テンプレートの変数を自動抽出（オプション）
    const extractedVariables = PromptRenderer.extractVariables(request.content);
    const variables =
      request.variables.length > 0
        ? request.variables
        : extractedVariables.map((name) => ({
            name,
            type: 'string' as const,
            description: `Auto-extracted variable: ${name}`,
            required: true,
          }));

    const template: PromptTemplate = {
      id,
      name: request.name,
      description: request.description,
      content: request.content,
      variables,
      tags: request.tags || [],
      version: `${this.versionPrefix}1.0.0`,
      createdAt: now,
      updatedAt: now,
      createdBy: request.createdBy,
      isActive: true,
      category: request.category,
    };

    return this.storage.create(template);
  }

  /**
   * プロンプトテンプレートを取得する
   */
  async read(id: string, version?: string): Promise<PromptTemplate | null> {
    return this.storage.read(id, version);
  }

  /**
   * プロンプトテンプレートを更新する
   */
  async update(id: string, request: UpdatePromptRequest): Promise<PromptTemplate> {
    const existing = await this.storage.read(id);
    if (!existing) {
      throw new Error(`Template with id ${id} not found`);
    }

    // 現在のバージョンをバージョン履歴に保存
    const [major, minor, patch] = existing.version
      .substring(1)
      .split('.')
      .map(Number);
    const newVersion = `${this.versionPrefix}${major}.${minor}.${patch + 1}`;

    const versionInfo: VersionInfo = {
      templateId: id,
      version: existing.version,
      content: existing.content,
      changelog: request.changelog || `Updated by ${request.updatedBy}`,
      createdAt: existing.updatedAt,
      createdBy: existing.createdBy,
    };
    await this.storage.saveVersion(id, versionInfo);

    // 新しいテンプレートを更新
    const updated = await this.storage.update(id, {
      ...existing,
      name: request.name !== undefined ? request.name : existing.name,
      description: request.description !== undefined ? request.description : existing.description,
      content: request.content !== undefined ? request.content : existing.content,
      variables: request.variables !== undefined ? request.variables : existing.variables,
      tags: request.tags !== undefined ? request.tags : existing.tags,
      category: request.category !== undefined ? request.category : existing.category,
      version: newVersion,
      updatedAt: new Date(),
    });

    return updated;
  }

  /**
   * プロンプトテンプレートを削除する
   */
  async delete(id: string): Promise<void> {
    return this.storage.delete(id);
  }

  /**
   * プロンプトテンプレートを検索する
   */
  async list(filter?: PromptFilter): Promise<PromptTemplate[]> {
    return this.storage.list(filter);
  }

  /**
   * バージョン履歴を取得する
   */
  async getVersions(id: string): Promise<VersionInfo[]> {
    return this.storage.getVersions(id);
  }

  /**
   * 特定のバージョンに戻す
   */
  async rollback(id: string, version: string, rolledBackBy: string): Promise<PromptTemplate> {
    const versionInfo = (await this.storage.getVersions(id)).find(
      (v) => v.version === version,
    );
    if (!versionInfo) {
      throw new Error(`Version ${version} not found`);
    }

    return this.update(id, {
      content: versionInfo.content,
      updatedBy: rolledBackBy,
      changelog: `Rolled back to version ${version}`,
    });
  }

  /**
   * プロンプトをレンダリング（変数埋め込み）
   */
  async render(request: RenderRequest): Promise<RenderResult> {
    const template = await this.storage.read(request.templateId, request.version);
    if (!template) {
      throw new Error(`Template with id ${request.templateId} not found`);
    }

    const rendered = PromptRenderer.render(
      template.content,
      request.variables,
      template.variables,
    );

    return {
      ...rendered,
      templateId: request.templateId,
      version: template.version,
      timestamp: new Date(),
    };
  }

  /**
   * テンプレートから変数を抽出する
   */
  extractVariables(content: string): string[] {
    return PromptRenderer.extractVariables(content);
  }
}
