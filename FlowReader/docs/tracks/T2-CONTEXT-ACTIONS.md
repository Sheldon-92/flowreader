### Title: team-feature-dev — 统一上下文 AI 快捷动作（含翻译）

### Background & Goal:
将翻译/解释/辨析/提问统一为一个上下文感知的 AI 入口，减少阅读中断，提升理解效率。

### Read First:
- FlowReader/docs/ux/reader_context_actions.md
- FlowReader/docs/api/chat_stream.md
- apps/web/src/routes/read/[bookId]/+page.svelte

### Task & AC:
- [ ] AC-1: 选区浮层+快捷键触发，左侧面板统一展示。
- [ ] AC-2: 接口支持 `intent/context/targetLang`（向后兼容）。
- [ ] AC-3: 翻译准确、辨析清晰；≤200字符 p50≤2s。
- [ ] AC-4: 无回归：阅读/对话主流程正常。

### Deliverables:
- `api/chat/stream.ts` 行为扩展（不破坏旧用法）
- 前端 Popover 与面板接入
- 使用说明文档更新

### Evidence:
```bash
npm run build
./scripts/test-api-endpoints.sh  # 增加翻译/解释端点检查
```

### Constraints:
- 选区≤300字符；前后文各≤300字符；
- 单请求串行，避免并发竞争。

### Gate: DO NOT START UNTIL GO:T2-CONTEXT-ACTIONS

