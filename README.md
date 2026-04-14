# themis-platform

这是由 `scripts/bootstrap-split-repos.sh` 初始化出来的拆仓仓库。

负责平台控制面、平台页面、节点/租约/调度/值班治理。

- 当前入口：`src/server/platform-main.ts`
- 当前状态：已落入最小平台页面与 `nodes/register|heartbeat|list|detail` API，并开始通过 `file:../themis-contracts` 依赖消费共享 access / worker 契约
- 迁移依据：请对照 `themis` 主仓里的 `docs/repository/themis-three-layer-split-migration-checklist.md`

当前最小能力：

- `GET /` 返回独立平台前端壳
- `GET /platform.js` 与 `GET /platform.css` 返回平台静态资源
- `GET /api/health` 返回 `themis-platform` 服务状态
- `GET /api/web-auth/status` 返回当前平台 Web 登录状态
- `POST /api/platform/nodes/register|heartbeat|list|detail` 提供最小节点控制面 API
- 其余 `/api/*` 统一返回共享 `PLATFORM_ROUTE_NOT_FOUND`

当前验证：

- `npm run test`
- `npm run typecheck`
- `npm run build`

下一步应优先继续迁入剩余真实 `http-platform` 路由，以及平台 CLI 主链实现。
