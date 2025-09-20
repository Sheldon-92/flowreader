### Title: devops-engineer — 部署与运行手册完善

### Background & Goal:
确保项目在本地/预发/生产环境的部署可重复、可验证、可追溯。

### Read First:
- FlowReader/docs/ops/deploy_runbook.md
- .env.example

### Task & AC:
- [ ] AC-1: 运行手册覆盖环境矩阵、变量、脚本与排错。
- [ ] AC-2: 本地验证命令全部通过（构建、端点、E2E 冒烟）。

### Deliverables:
- 运行手册与清单；
- 环境变量对照表；
- 构建与验证日志（简要）。

### Evidence:
```bash
./scripts/verify-setup.sh
npm run build
./scripts/test-api-endpoints.sh
```

### Constraints:
- 不引入新依赖导致构建风险；
- 不修改业务逻辑。

### Gate: DO NOT START UNTIL GO:T4-DEPLOY-PREP

