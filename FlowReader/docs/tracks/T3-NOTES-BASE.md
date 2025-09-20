### Title: frontend-specialist — 笔记基础能力（创建/列表/查看）

### Background & Goal:
以最小实现打通“AI 回答 → 保存为笔记 → 查看”的闭环，支持后续知识沉淀。

### Read First:
- FlowReader/docs/tech/notes_base_spec.md
- apps/web/src/routes/read/[bookId]/+page.svelte

### Task & AC:
- [ ] AC-1: 提供创建、列表、查看接口与前端最小 UI。
- [ ] AC-2: 从 AI 面板可一键保存要点为笔记。
- [ ] AC-3: RLS 正确，不泄漏跨用户数据。

### Deliverables:
- `api/notes/*` 端点；
- 阅读页笔记入口与列表/详情；
- 文档与使用说明。

### Evidence:
```bash
./scripts/test-api-endpoints.sh  # 扩展 notes 检查
npm run build
```

### Constraints:
- UI 简洁不干扰阅读；
- 不回归既有流程。

### Gate: DO NOT START UNTIL GO:T3-NOTES-BASE

