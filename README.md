# themis-platform

这是由 `scripts/bootstrap-split-repos.sh` 初始化出来的拆仓仓库。

负责平台控制面、平台页面、节点/租约/调度/值班治理。

- 当前入口：`src/server/platform-main.ts`
- 当前状态：已落入最小平台 bootstrap server，并开始通过 `file:../themis-contracts` 依赖消费共享 `managed-agent-platform-access` 契约
- 迁移依据：请对照 `themis` 主仓里的 `docs/repository/themis-three-layer-split-migration-checklist.md`

当前最小能力：

- `GET /` 返回平台 bootstrap JSON
- `GET /api/health` 返回 `themis-platform` 服务状态
- 其余 `/api/*` 统一返回共享 `PLATFORM_ROUTE_NOT_FOUND`

当前验证：

- `npm run test`
- `npm run typecheck`
- `npm run build`

下一步应优先迁入真实 `http-platform` 路由、平台独立前端壳与平台 CLI 主链实现。
