# FlowReader 云部署指南

## 当前状态
✅ Supabase 数据库已配置
✅ 认证系统已集成
✅ 本地开发环境可运行
✅ Vercel 配置文件已创建

## 还需要完成的步骤

### 1. Supabase Storage 配置
```sql
-- 在 Supabase SQL Editor 中执行
INSERT INTO storage.buckets (id, name, public)
VALUES ('books', 'books', false);

-- 设置存储策略
CREATE POLICY "Users can upload their own books" ON storage.objects
FOR INSERT WITH CHECK (bucket_id = 'books' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can view their own books" ON storage.objects
FOR SELECT USING (bucket_id = 'books' AND auth.uid()::text = (storage.foldername(name))[1]);
```

### 2. 环境变量准备
创建 `.env.production` 文件：
```env
PUBLIC_SUPABASE_URL=https://nlzayvpmyrjyveropyhq.supabase.co
PUBLIC_SUPABASE_ANON_KEY=你的anon_key
```

### 3. 修复需要处理的问题
- [ ] EPUB 解析服务（当前是 mock）
- [ ] 移除 Node.js 特定模块引用
- [ ] 实现真实的文件上传到 Supabase Storage

### 4. Vercel 部署步骤

#### 方式一：通过 GitHub（推荐）
1. 推送代码到 GitHub
2. 访问 https://vercel.com
3. 导入 GitHub 仓库
4. 选择 `apps/web` 作为根目录
5. 添加环境变量：
   - `PUBLIC_SUPABASE_URL`
   - `PUBLIC_SUPABASE_ANON_KEY`
6. 部署

#### 方式二：通过 CLI
```bash
# 安装 Vercel CLI
npm i -g vercel

# 在 apps/web 目录下
cd apps/web
vercel

# 按提示操作，设置环境变量
```

### 5. 部署后需要更新的配置

在 Supabase Dashboard 中：
1. **Authentication** → **URL Configuration**
   - Site URL: `https://你的项目.vercel.app`
   - Redirect URLs: 添加 `https://你的项目.vercel.app/**`

2. **Database** → **Tables**
   - 确认 RLS 策略已启用

### 6. 可选优化

#### 使用 Supabase Edge Functions 处理 EPUB
创建 `supabase/functions/parse-epub/index.ts`：
```typescript
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

serve(async (req) => {
  // EPUB 解析逻辑
  // 返回章节内容
})
```

#### 使用 CDN 加速
- Cloudflare Pages 作为替代
- 或使用 Vercel Edge Functions

## 快速测试清单
- [ ] 注册新用户
- [ ] 登录功能
- [ ] 上传 EPUB 文件
- [ ] 查看图书馆
- [ ] 阅读书籍（基础功能）

## 故障排查
1. **CORS 错误**：检查 Supabase URL 配置
2. **认证失败**：确认环境变量正确
3. **上传失败**：检查 Storage bucket 权限
4. **构建失败**：确认 Node 版本 >= 18