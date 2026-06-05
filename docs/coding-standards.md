# DAM-Link Backend 编码规范

> 本文件是 DAM-Link Backend 项目的**生产级**编码规范。所有 PR 必须满足本文件列出的规则。规则分为 **MUST**（强制）、**SHOULD**（推荐）和 **MAY**（可选）三档。

**适用范围：** `packages/api`（Node.js + Fastify + Drizzle）、`packages/contracts`（Zod schemas）、`packages/web`（React + Vite + TypeScript）。本文件中的示例基于 `packages/api`，前端有专门的章节。

**自动化保障：** `pnpm -r typecheck`、`pnpm -r lint`、`pnpm -r test` 在 CI 中必须全部通过（参见 `docs/deployment.md`）。

---

## 1. TypeScript 标准

### 1.1 编译器选项（MUST）

`packages/*/tsconfig.json` 必须启用：

```json
{
  "compilerOptions": {
    "target": "es2023",
    "module": "esnext",
    "moduleResolution": "bundler",
    "lib": ["es2023"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "verbatimModuleSyntax": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "isolatedModules": true
  }
}
```

### 1.2 禁止使用 `any`（MUST）

```ts
// ❌ NEVER
function parse(input: any) { ... }

// ✅ USE
function parse(input: unknown): Asset { ... }
```

唯一例外：在测试文件 `tests/` 中对 mock 库（如 `vi.fn()`）使用 `as unknown as X`，且必须就近添加 `eslint-disable-next-line` 注释并说明原因。

### 1.3 显式类型导入（MUST）

```ts
// ✅ type-only imports
import type { FastifyInstance } from 'fastify';
import type { Asset } from '../db/schema.js';
import { getDb, type DB } from '../db/client.js'; // 混合：值用普通 import，类型用 inline
```

禁止：
```ts
// ❌ 整体导入类型，会被 eraser 误删
import { FastifyInstance, Asset } from '...';
```

### 1.4 处理 `noUncheckedIndexedAccess`（MUST）

数组/对象索引默认返回 `T | undefined`：

```ts
const arr: string[] = [];
const item = arr[0]; // 类型是 string | undefined
if (!item) throw new AppError(404, 'NOT_FOUND', 'missing');

// 或者用非空断言 + 注释（最后手段）
const [first] = arr;
if (first === undefined) return null; // explicit
```

### 1.5 穷尽性检查（MUST）

对 `switch` 和 `if/else` 链，在联合类型上必须做穷尽性检查：

```ts
type Status = 'pending' | 'ready' | 'failed';

function label(s: Status): string {
  switch (s) {
    case 'pending': return 'Pending';
    case 'ready': return 'Ready';
    case 'failed': return 'Failed';
    // 加新分支时这里会编译失败，提醒处理
    default: {
      const _exhaustive: never = s;
      throw new Error(`Unknown status: ${_exhaustive}`);
    }
  }
}
```

### 1.6 显式返回类型（MUST）

导出的函数必须有显式返回类型。这能避免意外的 `Promise<T>` 漏写 await。

```ts
// ✅
export async function findUser(id: string): Promise<User | null> { ... }
export function toPublicSession(s: Session): PublicSession { ... }

// ❌
export async function findUser(id: string) { ... }
```

---

## 2. 文件与模块组织

### 2.1 三层架构（MUST）

```
src/
  routes/v1/         # 路由层：HTTP shape、参数解析、调用 service
  services/          # 业务逻辑：事务、跨 repo 编排、抛 AppError
  repositories/      # 数据访问：纯 SQL/Drizzle，无业务规则
  plugins/           # Fastify 插件：横切关注点（auth, cors, rate-limit, sentry）
  lib/               # 工具：s3, sharp, turnstile, ids, logger, passwords
  db/                # schema, client, migrate
```

依赖方向：`routes → services → repositories → db`，反向依赖禁止。

### 2.2 一个文件一个职责（SHOULD）

- 每个 `*.routes.ts` 只包含同一资源（`assets.routes.ts` 包含 `/assets` 全部方法，但不含 `/share-links`）。
- 每个 `*.service.ts` 只导出一个主要 domain（`assets.service.ts` 不处理 share-links）。
- 工具函数按功能分文件，禁止 `utils.ts` 大杂烩。

### 2.3 路径别名（MUST）

- 包内相对路径用 `./xxx.js`（注意 `.js` 后缀，因为 `moduleResolution: "bundler"` + ESM 需要）。
- 跨包用 `@dam-link/contracts` 这种 workspace 名字。
- 禁止 `../../../` 超过 3 层；超过 3 层意味着需要提取共用的中间层。

### 2.4 导出风格（MUST）

```ts
// ✅ 命名导出
export function foo() {}
export const BAR = 1;
export type { Asset };

// ❌ 默认导出（除 React 组件外）
export default function foo() {}
```

React 组件默认导出。

---

## 3. 命名规范

| 类型 | 风格 | 示例 |
|------|------|------|
| 文件名 | kebab-case | `share-links.service.ts` |
| 目录名 | kebab-case | `routes/v1/` |
| 变量/函数 | camelCase | `findUserById`, `sessionToken` |
| 类/类型/接口 | PascalCase | `AppError`, `ShareLink`, `FastifyRequest` |
| 常量 | UPPER_SNAKE_CASE（仅限真正不可变的） | `BUCKET`, `DOWNLOAD_TTL_SEC` |
| 枚举值 | camelCase（TS 风格） | `roleEnum('owner')` |
| 数据库表 | snake_case 复数 | `users`, `share_links` |
| 数据库列 | snake_case | `password_hash`, `object_key` |
| 环境变量 | UPPER_SNAKE_CASE | `DATABASE_URL`, `S3_BUCKET` |
| API 路径 | kebab-case | `/api/v1/share-links` |
| Git 分支 | kebab-case 带前缀 | `feature/auth`, `fix/csrf-header` |
| Commit type | Conventional Commits | `feat`, `fix`, `chore`, `test`, `docs` |

### 3.1 命名要表达意图（MUST）

```ts
// ❌ 含义不清
const d = new Date();
const arr = data.filter(x => x.t === 'a');

// ✅ 表达意图
const sessionExpiresAt = new Date();
const activeAssets = assets.filter(a => a.status === 'active');
```

### 3.2 布尔变量用 is/has/can 前缀（SHOULD）

```ts
const isLinkRedeemable = ...
const hasPassword = ...
const canEdit = ...
```

---

## 4. 错误处理

### 4.1 统一错误类型（MUST）

使用 `AppError`（定义在 `plugins/error-handler.ts`）：

```ts
import { AppError } from '../plugins/error-handler.js';

if (!asset) {
  throw new AppError(404, 'ASSET_NOT_FOUND', 'Asset not found');
}
if (asset.visibility === 'private') {
  throw new AppError(
    409,
    'ASSET_PRIVATE',
    'Asset visibility is "private"; change it to "link" or "org" before sharing',
  );
}
```

**禁止：**
- 抛裸 `Error`（`throw new Error('not found')`）
- 抛 `new Response(...)` 或字符串
- 路由层 `return reply.status(404).send({...})` 绕过错误处理器

### 4.2 错误码规范（MUST）

错误码格式：`SCREAMING_SNAKE_CASE`，点分命名空间按模块：

| 前缀 | 模块 |
|------|------|
| `VALIDATION_*` | 输入验证（自动） |
| `AUTH_*` | 认证（未登录、无效凭证） |
| `FORBIDDEN` / `CSRF_FORBIDDEN` | 权限 |
| `NOT_FOUND` | 资源不存在（自动 404 处理） |
| `ASSET_*` | 资产相关 |
| `ORG_*` | 组织相关 |
| `UPLOAD_*` | 上传相关 |
| `SHARE_LINK_*` | 分享链接相关 |
| `TURNSTILE_*` | 验证码相关 |
| `RATE_LIMITED` | 速率限制（自动） |
| `INTERNAL_ERROR` | 兜底（自动） |

### 4.3 错误响应格式（MUST）

所有错误响应必须符合 `ErrorBodySchema`（在 `packages/contracts/src/common.ts`）：

```json
{
  "error": {
    "code": "ASSET_NOT_FOUND",
    "message": "Asset not found",
    "details": { "assetId": "..." }  // 可选
  }
}
```

`details` 用于结构化字段级错误（如 Zod issues），不要塞入整个对象。

### 4.4 静默失败策略（MUST）

只在下列场景静默失败（不抛错、返回 `false` / `null`）：
- 探活（`pingDb()`, `pingS3()`）—— 上游故障不能拖垮健康检查
- Turnstile 验证（`verifyTurnstile`）—— 返回 `false` 让上层决定怎么响应

**其他所有错误必须抛出。** 绝不允许 `try { ... } catch { return null }`。

### 4.5 不要吞错（MUST）

```ts
// ❌ NEVER
try { await s3.delete(key); } catch (e) { /* ignore */ }

// ✅ 处理或重抛
try { await s3.delete(key); }
catch (e) {
  req.log.warn({ err: e, key }, 's3 delete failed; will retry on next GC');
  // 显式记录
}
```

---

## 5. 数据库（Drizzle）

### 5.1 Schema 优先，禁用 codegen（MUST）

Schema 是真理之源。修改表结构必须：
1. 改 `src/db/schema.ts`
2. 运行 `pnpm db:generate` 生成 migration SQL
3. **手工审查**生成的 SQL（特别是 enum/rename/drop）
4. 提交 SQL 文件

### 5.2 Repositories 只返回行（MUST）

```ts
// ✅ repository：返回 Drizzle 行
export async function findUserById(id: string): Promise<User | null> {
  const db = getDb();
  const rows = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return rows[0] ?? null;
}

// ❌ repository：返回 HTTP DTO（这是 service 的事）
export async function findUserPublic(id: string): Promise<PublicUser> { ... }
```

### 5.3 所有列必须显式列名（MUST）

```ts
// ✅
await db.select({ id: users.id, email: users.email }).from(users)...;

// ❌
await db.select().from(users); // 后续 services 引用 users.id 时若列被删，TS 不会报错
```

例外：只读全行的 `findXxxById` 内部使用，不需要外暴露。

### 5.4 软删除查询必须显式过滤（MUST）

`assets.deletedAt` 是软删除字段。任何业务查询都必须在 WHERE 中加 `isNull(assets.deletedAt)`，除非查询意图就是 trash：

```ts
// ✅
.where(and(eq(assets.id, id), isNull(assets.deletedAt)))

// ❌
.where(eq(assets.id, id))  // 软删的资产也会返回
```

### 5.5 事务（MUST）

跨表写操作必须用事务：

```ts
await db.transaction(async (tx) => {
  await tx.insert(memberships).values(...);
  await tx.update(orgs).set({ memberCount: sql`${orgs.memberCount} + 1` }).where(...);
});
```

### 5.6 索引命名（SHOULD）

`{table}_{column}_{suffix}`，suffix：
- `_idx` — 普通 B-tree
- `_unique` — UNIQUE
- `_trgm` — GIN trigram
- `_gin` — GIN
- `_pkey` — 主键（Drizzle 默认）

---

## 6. 验证（Zod）

### 6.1 所有 HTTP 输入必须经 Zod 验证（MUST）

使用 `fastify-type-provider-zod`：

```ts
const CreateAssetInputSchema = z.object({
  name: z.string().min(1).max(255),
  tags: z.array(z.string().min(1).max(50)).max(20).default([]),
});

app.post<{ Body: z.infer<typeof CreateAssetInputSchema> }>(
  '/assets',
  { schema: { body: CreateAssetInputSchema } },
  async (req) => { ... }
);
```

### 6.2 单源真理（MUST）

contracts 包里的 schema 同时是：
- 请求/响应验证
- 前后端共享类型（`import type { Asset } from '@dam-link/contracts'`）
- OpenAPI 文档的来源

禁止后端 `interface Asset` 与 contracts `AssetSchema` 双轨存在。

### 6.3 错误响应也用 Zod（MUST）

```ts
app.get('/x', {
  schema: {
    response: {
      200: OkSchema(ItemSchema),
      404: ErrorBodySchema,
      503: ErrorBodySchema,
    },
  },
}, handler);
```

### 6.4 严格模式（SHOULD）

对输入加 `.strict()` 防止客户端发送未定义字段：

```ts
const UpdateProfileInputSchema = z.object({
  displayName: z.string().min(1).max(100),
}).strict();
```

### 6.5 跨字段校验用 `.refine`（MUST）

```ts
const CreateShareLinkInputSchema = z.object({
  expiresAt: z.string().datetime().nullish(),
  password: z.string().min(8).max(128).optional(),
}).refine(
  (v) => v.expiresAt === undefined || new Date(v.expiresAt) > new Date(),
  { message: 'expiresAt must be in the future', path: ['expiresAt'] }
);
```

---

## 7. API 设计

### 7.1 REST 资源风格（MUST）

```
GET    /api/v1/orgs/:orgId/assets          # 列表
POST   /api/v1/orgs/:orgId/assets          # 创建
GET    /api/v1/orgs/:orgId/assets/:id      # 详情
PATCH  /api/v1/orgs/:orgId/assets/:id      # 部分更新
DELETE /api/v1/orgs/:orgId/assets/:id      # 软删
POST   /api/v1/orgs/:orgId/assets/:id/restore  # 恢复（动作资源）
```

- 集合用复数
- 动作用 POST + 动词子资源（`/restore`, `/finalize`, `/unlock`）
- 写操作幂等性靠 Idempotency-Key 头（v2 启用）

### 7.2 路径版租户隔离（MUST）

所有跨租户数据通过 `/api/v1/orgs/:orgId/...` 访问。`orgId` 永远在路径中，不在 body 或 query。

### 7.3 游标分页（MUST）

```ts
const Page = z.object({
  items: z.array(...),
  nextCursor: z.string().nullable(),
});
```

Cursor 是 base64 编码的 `(uploadedAt, id)` 元组，不暴露数据库实现。offset 分页禁止（无法稳定排序、慢）。

### 7.4 响应包装（MUST）

- 单个资源：`{ data: T }`
- 集合：`{ data: T[] }` 不带分页元信息，分页用 `Page<T>` schema
- 错误：`{ error: { code, message, details? } }`

### 7.5 HTTP 状态码（MUST）

| 场景 | 状态码 |
|------|--------|
| 创建成功 | 201 |
| 读取/更新/删除成功 | 200 / 204 |
| 输入验证失败 | 422 |
| 未认证 | 401 |
| 已认证但无权限 | 403 |
| 资源不存在 | 404 |
| 资源冲突（重复、状态非法） | 409 |
| 上游服务故障 | 502 / 503 |
| 未处理的内部错误 | 500（兜底） |

### 7.6 OpenAPI（SHOULD）

每个新路由必须：
1. 用 `schema: { tags, summary, body, response, params? }` 自描述
2. tags 用同一资源的复数（`assets`, `share-links`）
3. summary 用动词开头

---

## 8. 安全

### 8.1 密码哈希：Argon2id（MUST）

```ts
import { hashPassword, verifyPassword } from '../lib/passwords.js';
// 内部用 argon2id，memoryCost=65536, timeCost=3, parallelism=4
```

禁止：
- bcrypt（已过时）
- 自实现的 PBKDF2/scrypt
- 任何明文或对称加密存储

### 8.2 Cookie（MUST）

- `httpOnly: true`
- `secure: true`（生产；开发用 `NODE_ENV !== 'production'` 关闭）
- `sameSite: 'lax'`（跨站表单提交用 `'strict'`，但我们的 API 是 SPA → 'lax' 即可）
- `path: '/'`
- `maxAge` 与 session TTL 一致

### 8.3 CSRF（MUST）

所有非 GET 请求在 `csrf.ts` 插件中检查 `Origin` 头：

```ts
// Origin 不存在 → 允许（server-to-server）
// Origin === WEB_ORIGIN → 允许
// 否则 → 403 CSRF_FORBIDDEN
```

新增的 mutation 路由不需要额外配置；插件是全局的。

### 8.4 速率限制（MUST）

| 端点类型 | 限速（每 IP） |
|----------|---------------|
| `/api/v1/auth/*` | 5 / 分钟 |
| `/api/v1/share/:token/*`（公开） | 20 / 分钟 |
| 其他 API 路由 | 200 / 分钟（默认 tier） |

实现：在 `plugins/rate-limit.ts` 中用 `@fastify/rate-limit`，按 `config.rateLimit` 覆盖。

### 8.5 Turnstile（MUST）

`register` 和 `login` 必须调用 `verifyTurnstile(token, remoteIp)`。生产环境强制（`loadConfig` 拒绝缺 secret）。

### 8.6 日志脱敏（MUST）

`lib/logger.ts` 已配置 redact：

```ts
redact: {
  paths: [
    'req.headers.cookie',
    'req.headers.authorization',
    '*.password',
    '*.passwordHash',
    '*.password_hash',
    '*.token',
    '*.sessionToken',
  ],
}
```

新增敏感字段（如 `apiKey`, `secret`, `dsn`）必须加入 redact 列表。

### 8.7 密钥管理（MUST）

- 禁止把任何 secret 提交到 git（`.env*` 已在 `.gitignore`）
- 禁止在代码中硬编码 secret（包括测试 fixture — 用 `dotenv` + `.env.test`）
- 生产 secret 通过 `fly secrets set` 或 GitHub Actions secrets 注入
- `loadConfig` 启动时校验 `SESSION_COOKIE_SECRET >= 32 chars` 且不等于默认值

### 8.8 Sentry 数据脱敏（MUST）

`initSentry` 的 `beforeSend` 删除 `request.cookies` 和 `request.headers.cookie/authorization`。新增的自定义 PII 字段需要在这里脱敏。

### 8.9 Presigned URL TTL（MUST）

- 上传 PUT：最长 15 分钟
- 下载 GET：最长 15 分钟
- 缩略图 GET：最长 1 小时

---

## 9. 日志与可观测性

### 9.1 结构化日志（MUST）

使用 Pino，禁止 `console.log`：

```ts
req.log.info({ assetId, userId }, 'asset uploaded');
req.log.error({ err }, 's3 put failed');
```

### 9.2 每个请求有 requestId（MUST）

`plugins/request-id.ts` 已挂载 `onRequest` hook 添加 `req.id`。日志中应自然包含（由 Fastify 自带）。

### 9.3 服务层用 child logger（SHOULD）

```ts
const log = req.log.child({ assetId, orgId });
log.info('asset fetched');
log.warn({ err }, 'thumbnail generation failed');
```

### 9.4 不记录请求体（MUST）

请求体可能含密码、token、PII。日志只记录字段名：

```ts
// ❌ req.log.info({ body: req.body }, 'received')
// ✅ req.log.info({ fields: Object.keys(req.body) }, 'received')
```

### 9.5 5xx 才上报 Sentry（MUST）

`plugins/sentry.ts` 中 `if (status >= 500) captureException(...)`。4xx 是用户错误，不污染 Sentry。

### 9.6 健康检查（MUST）

- `/healthz`：DB + S3 + 进程启动时长
- `/version`：构建版本 + commit SHA
- 两个端点都不要求 auth

---

## 10. 测试

### 10.1 TDD：红 → 绿 → 重构（MUST）

每个任务的步骤：
1. 写失败的测试
2. 跑测试，确认失败信息正确
3. 写最小实现
4. 跑测试，确认通过
5. 重构（保持测试通过）
6. 提交

### 10.2 集成测试优先于单元测试（SHOULD）

`tests/` 目录里几乎都是 `app.inject()` 的集成测试，**真实** Postgres + MinIO（见 `tests/setup.ts`）。单元测试只在以下场景使用：
- 纯函数（`toPublicSession`, `isLinkRedeemable`）
- 副作用需要 mock 的（`verifyTurnstile` 用 `globalThis.fetch` 替换）

### 10.3 测试隔离（MUST）

- `beforeEach` 必须 `await truncateAllTables()` 和 `await flushTestBucket()`
- 每个 `describe` 块一个 `app` 实例（`beforeAll` / `afterAll`）
- `vitest.config.ts` 强制 `pool: 'forks', singleFork: true`（共享 DB + S3 不能并行）

### 10.4 测试命名（MUST）

`describe('HTTP method path', ...)`，如：
- `describe('POST /api/v1/auth/register', ...)`
- `describe('share links', ...)`  // 资源名

`it` 用陈述句：
- `it('rejects a cross-origin POST with 403', ...)`
- `it('returns a presigned PUT URL with 5-minute TTL', ...)`

### 10.5 不要在测试中 sleep（MUST）

绝对禁止 `await new Promise(r => setTimeout(r, 1000))`。如果要等异步操作，用轮询 helper：

```ts
async function waitFor(predicate: () => Promise<boolean>, timeoutMs = 5000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await predicate()) return;
    await new Promise(r => setTimeout(r, 50));
  }
  throw new Error('waitFor: timeout');
}
```

### 10.6 覆盖率门槛（SHOULD）

- 关键路径（auth、uploads、share-links、import）必须 100% 覆盖
- 边缘情况（404、403、过期链接）必须有显式测试
- 全局覆盖率目标 ≥ 80%

---

## 11. Git 工作流

### 11.1 Conventional Commits（MUST）

```
<type>(<scope>): <subject>

<body>

<footer>
```

**type：** `feat`, `fix`, `chore`, `test`, `docs`, `refactor`, `perf`, `build`, `ci`
**scope（可选）：** `api`, `contracts`, `web`, `db`, `deploy`, `auth`, `assets`, ...

**示例：**
```
feat(auth): add email+password register with Argon2id
fix(uploads): HEAD on S3 returns 404 after PUT, finalize should not crash
chore(deps): bump fastify to 5.1.0
test(share-links): cover password unlock + expiry
docs(deployment): document R2 CORS policy
```

### 11.2 提交粒度（MUST）

一个 commit = 一个原子变更。

- ✅ 4 个 commit：schema → migration → service → route
- ❌ 1 个 commit："feat: add asset CRUD, search, share, etc."

每个 commit 后 `pnpm -r typecheck && pnpm -r test` 必须通过。

### 11.3 禁止危险操作（MUST）

- `git push --force`（除非明确要求）
- `git reset --hard`
- `git commit --amend`（已推送的）
- `git push --no-verify`
- `git checkout .` / `git restore .`（丢失工作）

### 11.4 分支命名（MUST）

```
<type>/<short-kebab-description>

feat/auth-register
fix/csrf-origin-check
chore/bump-pnpm-9
```

### 11.5 禁止把 worktree 提交到主仓库（MUST）

`.worktrees/` 在 `.gitignore`。`git check-ignore .worktrees` 必须返回 0。

---

## 12. 代码审查清单

每次 PR 必须由 reviewer（人或 subagent）按本清单审查。**任一 MUST 项不通过即拒绝合并。**

### 12.1 规范符合性（MUST）

- [ ] 任务描述与 spec 一一对应
- [ ] 没有超出任务范围的修改
- [ ] 没有缺失的子任务（如"加路由但没加测试"）

### 12.2 代码质量（MUST）

- [ ] 无 `any`（除测试中的显式 mock）
- [ ] 无 `console.log`
- [ ] 无 `// @ts-ignore`（`@ts-expect-error` 可以，但要注释原因）
- [ ] 无 `// FIXME` / `// TODO`（新代码不应留债）
- [ ] 错误处理用 `AppError`，错误码在 §4.2 列表中
- [ ] 数据库查询显式列名，repository 不暴露 DTO
- [ ] 新增的 schema 同步更新到 `packages/contracts`

### 12.3 安全性（MUST）

- [ ] 没有引入新依赖到 `package.json`（如必要，单独 PR 说明理由）
- [ ] 任何用户输入都经 Zod 验证
- [ ] 新增 mutation 路由自动获得 CSRF 保护（无需手动配置）
- [ ] 任何新增的速率限制 tier 在 §8.4 表中
- [ ] 任何新增的敏感字段加入 `lib/logger.ts` 的 redact 列表

### 12.4 可观测性（SHOULD）

- [ ] 关键路径有结构化日志
- [ ] 错误日志包含 `err`、相关 ID（assetId、userId、orgId）
- [ ] 5xx 路径不漏掉 Sentry

### 12.5 测试（MUST）

- [ ] 测试通过 `pnpm -r test`
- [ ] typecheck 通过
- [ ] 覆盖率不低于本计划门槛
- [ ] 关键 happy path + 关键 error path 都有测试

### 12.6 文档（SHOULD）

- [ ] 复杂算法有注释解释 **为什么**（不是 **做什么**）
- [ ] 公开 API（routes、services、repos 导出函数）有 JSDoc
- [ ] 破坏性变更在 `docs/` 下新增 ADR（架构决策记录）

---

## 13. 前端规范（`packages/web`）

> 仅适用于 `packages/web`（Plan 8 引入）。后端规范继续适用。

### 13.1 状态管理（MUST）

- 全局状态用 `useReducer` + Context，禁止 Redux/Zustand（除非有明确需求）
- 副作用（API 调用）放 `useEffect` 或自定义 hook（如 `useUpload`）
- 不在组件中直接调用 `fetch`，统一走 `src/api/client.ts`

### 13.2 组件（SHOULD）

- 纯展示组件放在 `src/components/`，与容器组件分离
- Props 用 `interface` 显式声明
- 默认导出；命名风格 PascalCase

### 13.3 类型（MUST）

- 所有 API 响应类型从 `@dam-link/contracts` 导入，禁止在 web 包内重新定义
- 任何 `localStorage` 读取后用 Zod 验证（防止手动改存储破坏应用）

### 13.4 路由（MUST）

- 用 React Router（Plan 8 引入）
- 受保护路由用 `<RequireAuth>` 包装
- 公开路由（分享链接、登录）直接挂载

### 13.5 构建（MUST）

- `pnpm --filter @dam-link/web build` 必须成功
- 不在产物中打印 `console.log`
- 不引入超过 100KB gzipped 的新依赖（PR 中说明）

---

## 14. 紧急豁免流程

出现以下情况时，**必须**在 PR 描述中显式声明"违反 §X.Y 规则"并给出理由 + 后续修复 issue 链接：

- §1.2 用了 `any`（必须 `@ts-expect-error` + 注释）
- §4.1 抛了非 `AppError`（必须说明与上游库的兼容性）
- §11.3 用了危险 git 命令（必须 reviewer 二次确认）

无声明的违规一律拒绝合并。

---

## 15. 参考

- 项目部署流程：`docs/deployment.md`
- API 文档：`http://localhost:3000/docs`（开发）或 `https://api.dam-link.example/docs`（生产）
- 实施计划：`docs/superpowers/plans/`
- 决策记录：未来用 `docs/adr/YYYY-MM-DD-title.md`（ADR 待启用）

---

**最后更新：** 2026-06-04（Plan 9 完成后）
