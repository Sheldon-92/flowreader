# 文档冻结说明（MVP 基线）

> 冻结日期: 2025-09-18
> 冻结范围: FlowReader MVP 相关产品/设计/技术/测试/运维文档
> 冻结目标: 形成可交接、可实现、可验证的统一基线；后续变更需走 ADR 并版本号递增

## 冻结清单（文件与版本）

- 计划与索引
  - phase_1_plan.md — v1.0
  - FlowReader/docs/INDEX.md — v1.0
- 产品与决策
  - FlowReader/docs/mvp/PRD_MVP.md — v1.0
  - FlowReader/docs/DECISIONS.md — v1.0
  - FlowReader/docs/GLOSSARY.md — v1.0
- 交互与样式
  - FlowReader/docs/ux/reader_context_actions.md — v1.0
  - FlowReader/docs/ux/reader_context_actions_style.md — v1.0
- API 与技术
  - FlowReader/docs/api/chat_stream.md — v1.0
  - FlowReader/docs/tech/rag_optimization_plan.md — v1.0
  - FlowReader/docs/tech/notes_base_spec.md — v1.0
- 测试与运维
  - FlowReader/docs/qa/test_plan.md — v1.0
  - FlowReader/docs/ops/deploy_runbook.md — v1.0
- 执行轨道（ASGO）
  - FlowReader/docs/tracks/T1-RAG-OPT.md — v1.0
  - FlowReader/docs/tracks/T2-CONTEXT-ACTIONS.md — v1.0
  - FlowReader/docs/tracks/T3-NOTES-BASE.md — v1.0
  - FlowReader/docs/tracks/T4-DEPLOY-PREP.md — v1.0

注：`PRODUCT_VISION.md`、`PROJECT_STATUS.md`、`DELIVERABLE_STATUS.md`为参考文档，未纳入本次冻结范围。

## 冻结规则

- 任何修改需新增 ADR，更新对应文档版本号（v1.x → v1.x+1）。
- 重大范围变更需 PO 发放新的 GO 令牌并更新阶段计划。
- 测试/部署脚本调整需同步更新《测试计划》与《运行手册》。

## 交付与接手

- 交付入口：`FlowReader/docs/INDEX.md`
- 执行按轨道：T1 → T2 → T3（T4 并行）
- 验收依据：各轨道文档中的 AC 与 Evidence

状态: DOCS-FROZEN ✅
