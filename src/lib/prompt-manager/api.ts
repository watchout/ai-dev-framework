/**
 * プロンプト管理 REST API
 * 
 * 注: Express 統合時に使用します。
 * Express をインストール: npm install express @types/express
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
type Request = any;
type Response = any;
type NextFunction = any;
type Router = any;
import {
  ApiResponse,
  ApiErrorResponse,
  CreatePromptRequest,
  UpdatePromptRequest,
  RenderRequest,
} from './types';
import { PromptManager } from './manager';

export function createPromptRouter(manager: PromptManager): any {
  // ExpressRouter の作成（実装時は express.Router()）
  const router: any = {};

  // ミドルウェア: レスポンスヘッダー設定
  router.use((_req: Request, res: Response, next: NextFunction) => {
    res.set('Content-Type', 'application/json');
    next();
  });

  /**
   * POST /prompts - 新しいプロンプトテンプレートを作成
   */
  router.post('/prompts', async (req: Request, res: Response) => {
    try {
      const request: CreatePromptRequest = req.body;
      validateCreateRequest(request);

      const template = await manager.create(request);
      sendSuccess(res, template, 201);
    } catch (error) {
      sendError(res, error);
    }
  });

  /**
   * GET /prompts/:id - プロンプトテンプレートを取得
   */
  router.get('/prompts/:id', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { version } = req.query;

      const template = await manager.read(id, version as string | undefined);
      if (!template) {
        return sendError(
          res,
          new Error('Template not found'),
          404,
        );
      }

      sendSuccess(res, template);
    } catch (error) {
      sendError(res, error);
    }
  });

  /**
   * PATCH /prompts/:id - プロンプトテンプレートを更新
   */
  router.patch('/prompts/:id', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const request: UpdatePromptRequest = req.body;
      validateUpdateRequest(request);

      const updated = await manager.update(id, request);
      sendSuccess(res, updated);
    } catch (error) {
      sendError(res, error);
    }
  });

  /**
   * DELETE /prompts/:id - プロンプトテンプレートを削除
   */
  router.delete('/prompts/:id', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      await manager.delete(id);
      res.status(204).send();
    } catch (error) {
      sendError(res, error);
    }
  });

  /**
   * GET /prompts - プロンプトテンプレートを検索
   */
  router.get('/prompts', async (req: Request, res: Response) => {
    try {
      const filter = {
        name: req.query.name as string | undefined,
        tags: req.query.tags ? (req.query.tags as string).split(',') : undefined,
        category: req.query.category as string | undefined,
        isActive: req.query.isActive ? req.query.isActive === 'true' : undefined,
        createdBy: req.query.createdBy as string | undefined,
      };

      const templates = await manager.list(filter);
      sendSuccess(res, templates);
    } catch (error) {
      sendError(res, error);
    }
  });

  /**
   * GET /prompts/:id/versions - バージョン履歴を取得
   */
  router.get('/prompts/:id/versions', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const versions = await manager.getVersions(id);
      sendSuccess(res, versions);
    } catch (error) {
      sendError(res, error);
    }
  });

  /**
   * POST /prompts/:id/rollback - 特定のバージョンに戻す
   */
  router.post('/prompts/:id/rollback', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { version, rolledBackBy } = req.body;

      if (!version || !rolledBackBy) {
        return sendError(
          res,
          new Error('Missing required fields: version, rolledBackBy'),
          400,
        );
      }

      const template = await manager.rollback(id, version, rolledBackBy);
      sendSuccess(res, template);
    } catch (error) {
      sendError(res, error);
    }
  });

  /**
   * POST /prompts/render - プロンプトをレンダリング（変数埋め込み）
   */
  router.post('/prompts/render', async (req: Request, res: Response) => {
    try {
      const request: RenderRequest = req.body;
      validateRenderRequest(request);

      const result = await manager.render(request);
      sendSuccess(res, result);
    } catch (error) {
      sendError(res, error);
    }
  });

  /**
   * POST /prompts/extract-variables - テンプレートから変数を抽出
   */
  router.post('/prompts/extract-variables', (req: Request, res: Response) => {
    try {
      const { content } = req.body;
      if (!content || typeof content !== 'string') {
        return sendError(
          res,
          new Error('Missing required field: content'),
          400,
        );
      }

      const variables = manager.extractVariables(content);
      sendSuccess(res, { variables });
    } catch (error) {
      sendError(res, error);
    }
  });

  return router;
}

/**
 * バリデーション関数
 */
function validateCreateRequest(request: CreatePromptRequest): void {
  if (!request.name || typeof request.name !== 'string') {
    throw new Error('Missing or invalid required field: name');
  }
  if (!request.description || typeof request.description !== 'string') {
    throw new Error('Missing or invalid required field: description');
  }
  if (!request.content || typeof request.content !== 'string') {
    throw new Error('Missing or invalid required field: content');
  }
  if (!request.createdBy || typeof request.createdBy !== 'string') {
    throw new Error('Missing or invalid required field: createdBy');
  }
}

function validateUpdateRequest(request: UpdatePromptRequest): void {
  if (!request.updatedBy || typeof request.updatedBy !== 'string') {
    throw new Error('Missing or invalid required field: updatedBy');
  }
}

function validateRenderRequest(request: RenderRequest): void {
  if (!request.templateId || typeof request.templateId !== 'string') {
    throw new Error('Missing or invalid required field: templateId');
  }
  if (!request.variables || typeof request.variables !== 'object') {
    throw new Error('Missing or invalid required field: variables');
  }
}

/**
 * レスポンスヘルパー
 */
function sendSuccess<T>(res: Response, data: T, status: number = 200): void {
  const response: ApiResponse<T> = {
    success: true,
    data,
    timestamp: new Date(),
  };
  res.status(status).json(response);
}

function sendError(res: Response, error: unknown, status: number = 400): void {
  const message = error instanceof Error ? error.message : 'Unknown error';
  const response: ApiErrorResponse = {
    success: false,
    error: {
      code: 'ERROR',
      message,
    },
    timestamp: new Date(),
  };
  res.status(status).json(response);
}
