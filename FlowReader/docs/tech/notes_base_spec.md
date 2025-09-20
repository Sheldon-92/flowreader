# 技术规格：笔记基础能力（T3-NOTES-BASE）

## 目标
- 最小可用：创建 → 列表 → 查看；
- 与阅读/AI 面板联动：从回答中一键保存要点。

## 数据模型（建议）
- 表：`notes`
  - `id` (uuid, pk)
  - `user_id` (uuid) — RLS: `user_id = auth.uid()`
  - `book_id` (text)
  - `location` (jsonb) — 选区定位（章节、段偏移）
  - `source` (text) — manual|ai
  - `content` (jsonb) — { text, translation?, bullets? }
  - `created_at` (timestamptz, default now())

## API（最小）
- `POST /api/notes` — 创建
  - body: { bookId, location, content, source }
  - returns: { id }
- `GET /api/notes?bookId=...` — 列表
- `GET /api/notes/:id` — 详情

## 前端
- 阅读页：
  - AI 面板中“保存为笔记”→ 调用 POST；
  - 侧边或页内“笔记”入口（最小列表）。

## 验收
- 能创建、列出与查看；
- RLS 正确：不同用户隔离；
- 不回归阅读与对话主流程。

