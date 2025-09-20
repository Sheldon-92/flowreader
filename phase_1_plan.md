# 阶段计划 — FlowReader（Phase 1）

> 协调者：PO（产品负责人）
> 方法：ASGO（并行轨道 + 阶段闸门 + 证据）
> 原则：并行执行、证据闭环、严格 Gate

## 目标

- 完成“文本 AI 伴读”的 MVP 质量交付；
- 提升 AI 基于书内上下文的理解与回答质量（RAG 优化）；
- 提供上下文 AI 快捷动作（翻译/解释/辨析/提问）；
- 准备笔记基础能力的最小闭环；
- 保持可部署性（构建、脚本与冒烟测试通过）。

## 工作计划

| Track | Subagent | Scope | depends_on | ready_when | Deliverables | Evidence | State |
|------|----------|-------|------------|------------|--------------|----------|-------|
| T1-RAG-OPT | backend-architect | 提升检索与上下文质量 | - | 立即 | 优化 `api/_lib/rag-processor.ts`、评测日志 | `node api/_spikes/rag-quality-test.ts`、`./scripts/test-api-endpoints.sh` | READY |
| T2-CONTEXT-ACTIONS | team-feature-dev | 统一上下文 AI 快捷动作（含翻译） | T1-RAG-OPT | GO:T2-CONTEXT-ACTIONS | `api/chat/stream.ts` 支持 intent+context；选区 Popover；左侧面板接入；文档 | 构建通过；2 个样例断言；端点脚本更新 | PENDING |
| T3-NOTES-BASE | frontend-specialist | 笔记基础（创建/列表/查看） | T2-CONTEXT-ACTIONS | GO:T3-NOTES-BASE | `api/notes/*`；`apps/web/src/routes/read/[bookId]/notes/` 最小 UI；文档 | `./scripts/test-api-endpoints.sh` 增加 notes；小型 E2E | PENDING |
| T4-DEPLOY-PREP | devops-engineer | 部署与运行手册完善 | 并行 | 立即 | 运行手册、环境矩阵、验证日志 | `./scripts/verify-setup.sh`；构建与脚本记录 | READY |

备注：
- 本阶段不包含音频/TTS（成本决策），聚焦文本理解体验；
- 保持向后兼容，不回归现有 MVP 流程。

## 验收标准（AC）

- AC-1：构建与核心 API/脚本通过；
- AC-2：RAG 在固定样本上较基线有可测提升；
- AC-3：上下文 AI 动作可用、准确、延迟可接受（≤200 字 p50≤2s）；
- AC-4：笔记可创建/列表/查看且不影响阅读与对话；
- AC-5：登录、书库、阅读、对话无重大回归。

## 证据（Evidence）

```bash
./scripts/verify-setup.sh
npm run build
./scripts/test-api-endpoints.sh
node api/_spikes/rag-quality-test.ts
npm run test:e2e
```

## Gate 规则

1. 立即启动：T1-RAG-OPT、T4-DEPLOY-PREP（READY）
2. 验收通过后发放：GO:T2-CONTEXT-ACTIONS（依赖 T1）
3. 验收通过后发放：GO:T3-NOTES-BASE（依赖 T2）

发放格式：`GO:<TRACK_ID>`（仅 PO 有权限）

## 风险与对策

- 质量波动：固定样本做回归，出现退步则暂停发放 Gate；
- 范围膨胀：严格按 AC 收敛，超出部分顺延；
- 性能与成本：限制上下文长度与 Top-K，避免提示词膨胀。

## 汇报模板

```markdown
## 进度更新 - [日期]

### 已完成:
- ✅ [TRACK_ID]: [简要描述] - 已验收通过

### 当前状态:
- 🔄 [TRACK_ID]: [agent-type] 正在执行
- ⏳ [TRACK_ID]: 等待GO令牌

### 下一步:
- 准备[NEXT_TRACK_ID]的Prompt
- 预计[时间]完成当前Track
```

## 下一步

- 若需执行，请发放 `GO:T1-RAG-OPT` 与 `GO:T4-DEPLOY-PREP`。
