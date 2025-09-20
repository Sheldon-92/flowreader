# 部署运行手册（T4-DEPLOY-PREP）

## 环境矩阵
- 本地：Node 18+、pnpm/npm、Supabase CLI、Vercel CLI（可选）。
- 变量：参考 `.env.example`，在本地使用 `.env.local`。

## 本地校验
```bash
./scripts/verify-setup.sh
./scripts/install-deps.sh
npm run build
./scripts/test-api-endpoints.sh
```

## 数据库
- Supabase 启动：`npx supabase start`
- 迁移：`npx supabase db reset`

## 部署（Vercel）
1. 将仓库连接至 Vercel；
2. 在 Vercel 项目设置中配置生产环境变量（与 `.env.example` 对齐）；
3. 触发构建与部署；
4. 验证核心端点与 E2E 冒烟；
5. 记录版本与变更说明。

## 故障排查
- 500 错误：查看函数日志（Vercel）与 `requestId`；
- 认证问题：校验 Supabase 公私钥与回调 URL；
- 构建失败：锁版本、清理缓存、重装依赖。

