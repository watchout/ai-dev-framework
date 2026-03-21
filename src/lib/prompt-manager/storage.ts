/**
 * プロンプトテンプレートストレージレイヤー
 */

import { PromptTemplate, VersionInfo, PromptFilter } from './types';

export interface StorageAdapter {
  create(template: PromptTemplate): Promise<PromptTemplate>;
  read(id: string, version?: string): Promise<PromptTemplate | null>;
  update(id: string, updates: Partial<PromptTemplate>): Promise<PromptTemplate>;
  delete(id: string): Promise<void>;
  list(filter?: PromptFilter): Promise<PromptTemplate[]>;
  getVersions(id: string): Promise<VersionInfo[]>;
  saveVersion(templateId: string, version: VersionInfo): Promise<void>;
}

/**
 * メモリベースのストレージ実装（開発用）
 */
export class InMemoryStorage implements StorageAdapter {
  private templates: Map<string, PromptTemplate> = new Map();
  private versions: Map<string, VersionInfo[]> = new Map();

  async create(template: PromptTemplate): Promise<PromptTemplate> {
    this.templates.set(template.id, template);
    // 初期バージョンを保存
    const initialVersion: VersionInfo = {
      templateId: template.id,
      version: template.version,
      content: template.content,
      changelog: 'Initial version',
      createdAt: template.createdAt,
      createdBy: template.createdBy,
    };
    this.versions.set(template.id, [initialVersion]);
    return template;
  }

  async read(id: string, version?: string): Promise<PromptTemplate | null> {
    if (!version) {
      return this.templates.get(id) || null;
    }
    // 指定バージョンを返す
    const versions = this.versions.get(id) || [];
    const versionInfo = versions.find((v) => v.version === version);
    if (!versionInfo) return null;

    const template = this.templates.get(id);
    if (!template) return null;

    return { ...template, content: versionInfo.content, version: versionInfo.version };
  }

  async update(id: string, updates: Partial<PromptTemplate>): Promise<PromptTemplate> {
    const existing = this.templates.get(id);
    if (!existing) {
      throw new Error(`Template with id ${id} not found`);
    }

    const updated: PromptTemplate = {
      ...existing,
      ...updates,
      updatedAt: new Date(),
      id: existing.id,
      // updates に version が含まれている場合はそれを使う
    };

    this.templates.set(id, updated);
    return updated;
  }

  async delete(id: string): Promise<void> {
    this.templates.delete(id);
    this.versions.delete(id);
  }

  async list(filter?: PromptFilter): Promise<PromptTemplate[]> {
    let templates = Array.from(this.templates.values());

    if (filter) {
      if (filter.name) {
        templates = templates.filter((t) => t.name.includes(filter.name!));
      }
      if (filter.tags && filter.tags.length > 0) {
        templates = templates.filter((t) =>
          filter.tags!.some((tag) => t.tags.includes(tag)),
        );
      }
      if (filter.category) {
        templates = templates.filter((t) => t.category === filter.category);
      }
      if (filter.isActive !== undefined) {
        templates = templates.filter((t) => t.isActive === filter.isActive);
      }
      if (filter.createdBy) {
        templates = templates.filter((t) => t.createdBy === filter.createdBy);
      }
    }

    return templates;
  }

  async getVersions(id: string): Promise<VersionInfo[]> {
    return this.versions.get(id) || [];
  }

  async saveVersion(templateId: string, version: VersionInfo): Promise<void> {
    const versions = this.versions.get(templateId) || [];
    versions.push(version);
    this.versions.set(templateId, versions);
  }
}
