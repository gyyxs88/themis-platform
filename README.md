# themis-platform

这是由 `scripts/bootstrap-split-repos.sh` 初始化出来的拆仓仓库。

负责平台控制面、平台页面、节点/租约/调度/值班治理。

- 当前入口：`src/server/platform-main.ts`
- 当前状态：已落入最小平台页面、`nodes/register|heartbeat|list|detail|drain|offline|reclaim` API、`agents/list|detail|create|execution-boundary/update|spawn-policy/update|pause|resume|archive` 最小 agents 控制面、`projects/workspace-binding/list|detail|upsert` 最小 projects 控制面、`agents/governance-overview|waiting/list|collaboration-dashboard|handoffs/list` 最小治理读面、`oncall/summary` 值班建议读面、`work-items/list|detail|dispatch|respond|escalate|cancel` 与 `agents/mailbox/list|pull|ack|respond` 协作读写面、`runs/list|detail` recent runs 读面、`worker/runs/pull|update|complete` 最小执行链路，以及独立 `themis-platform` CLI 的 `auth platform / doctor worker-fleet / worker-fleet` 首版实现，并开始通过 `file:../themis-contracts` 依赖消费共享 access / worker / agents / collaboration / projects / work-items / oncall 契约
- 迁移依据：请对照 `themis` 主仓里的 `docs/repository/themis-three-layer-split-migration-checklist.md`

当前最小能力：

- `GET /` 返回独立平台前端壳
- `GET /platform.js` 与 `GET /platform.css` 返回平台静态资源
- `GET /api/health` 返回 `themis-platform` 服务状态
- `GET /api/web-auth/status` 返回当前平台 Web 登录状态
- `POST /api/platform/nodes/register|heartbeat|list|detail|drain|offline|reclaim` 提供最小节点控制面 API
- `POST /api/platform/agents/list|detail|create|execution-boundary/update|spawn-policy/update|pause|resume|archive` 提供最小 agents 控制面 API
- `POST /api/platform/projects/workspace-binding/list|detail|upsert` 提供最小项目工作区绑定 API
- `POST /api/platform/agents/governance-overview|waiting/list|collaboration-dashboard|handoffs/list` 提供最小治理摘要、父任务协作分组与 handoff 时间线 API
- `POST /api/platform/oncall/summary` 提供最小值班建议汇总 API
- `POST /api/platform/work-items/list|detail|dispatch|respond|escalate|cancel` 提供最小 work-items 协作主链 API
- `POST /api/platform/agents/mailbox/list|pull|ack|respond` 提供最小 mailbox 读写 API
- `POST /api/platform/runs/list|detail` 提供最小 recent runs 读面
- `POST /api/platform/worker/runs/pull|update|complete` 提供最小 Worker 执行回传 API
- `./themis-platform auth platform list|add|remove|rename` 提供平台服务令牌的最小本地治理入口
- `./themis-platform doctor worker-fleet` 提供 Worker Fleet 巡检摘要
- `./themis-platform worker-fleet <drain|offline|reclaim>` 提供最小节点治理 CLI
- 其余 `/api/*` 统一返回共享 `PLATFORM_ROUTE_NOT_FOUND`

当前验证：

- `npm run test`
- `npm run typecheck`
- `npm run build`

当前边界：

- `auth platform` 首版当前使用本地 `infra/local/platform-service-tokens.json` 保存平台服务令牌元数据，后续再和平台持久化控制面打通。
- `doctor worker-fleet` 与 `worker-fleet` 已迁入独立平台仓，但当前仍只覆盖最小节点值班与治理闭环。
- 当前治理页已覆盖最小 `agents + projects + governance-overview + waiting/list + collaboration-dashboard + handoffs/list + oncall/summary + work-items + mailbox + recent runs`。

下一步应优先把本地 token 存储与平台服务端鉴权事实继续收口到同一控制面，再逐步把当前 in-memory 平台事实换成真实持久化控制面。
