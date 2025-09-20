### Title: backend-architect — 提升 RAG 检索与上下文质量

### Background & Goal:
当前聊天依赖检索上下文，但质量波动。目标是优化分块/检索/重排/拼接，降低无关内容，提升回答相关性，同时控制成本与延迟。

### Read First:
- FlowReader/docs/tech/rag_optimization_plan.md
- api/_spikes/rag-quality-test.ts
- api/_lib/rag-processor.ts

### Task & AC:
- [ ] AC-1: 优化参数/策略并提交变更说明。
- [ ] AC-2: 样本集评测相对基线有提升（检索命中/相关性）。
- [ ] AC-3: 不显著增加延迟与 token 成本（±10% 内）。

### Deliverables:
- 优化后的 `api/_lib/rag-processor.ts`
- 评测报告或日志（样本与结果对比）

### Evidence:
```bash
node api/_spikes/rag-quality-test.ts
./scripts/test-api-endpoints.sh
```

### Constraints:
- 控制 Top-K 与重排开销；
- 保持接口向后兼容。

### Gate: DO NOT START UNTIL GO:T1-RAG-OPT

