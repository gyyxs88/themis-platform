# themis-platform

这是由 `scripts/bootstrap-split-repos.sh` 初始化出来的拆仓仓库。

负责平台控制面、平台页面、节点/租约/调度/值班治理。

- 当前入口：`src/server/platform-main.ts`
- 独立 CLI：仓库根目录 `./themis-platform`
- 当前状态：已落入最小平台页面、`nodes/register|heartbeat|list|detail|drain|offline|reclaim` API、`agents/list|detail|create|execution-boundary/update|spawn-policy/update|pause|resume|archive` 最小 agents 控制面、`projects/workspace-binding/list|detail|upsert` 最小 projects 控制面、`agents/governance-overview|waiting/list|collaboration-dashboard|handoffs/list` 最小治理读面、`oncall/summary` 值班建议读面、`work-items/list|detail|dispatch|respond|escalate|cancel` 与 `agents/mailbox/list|pull|ack|respond` 协作读写面、`runs/list|detail` recent runs 读面、最小 `Web Access + Platform Service Bearer` 鉴权链，以及 `worker/runs/pull|update|complete` 的首版自动调度执行链路；当前 `worker pull` 已能把 `queued work-item` 结合项目工作区绑定自动分配成新 `run + execution lease`，并继续通过 `file:../themis-contracts` 消费共享 access / worker / agents / collaboration / projects / work-items / oncall 契约
- 迁移依据：请对照 `themis` 主仓里的 `docs/repository/themis-three-layer-split-migration-checklist.md`

当前最小能力：

- `GET /` 返回独立平台前端壳
- `GET /platform.js` 与 `GET /platform.css` 返回平台静态资源
- `GET /api/health` 返回 `themis-platform` 服务状态
- `GET /login`、`POST /api/web-auth/login|logout`、`GET /api/web-auth/status` 提供最小平台 Web 登录态
- `POST /api/platform/nodes/register|heartbeat|list|detail|drain|offline|reclaim` 提供最小节点控制面 API
- `POST /api/platform/agents/list|detail|create|execution-boundary/update|spawn-policy/update|pause|resume|archive` 提供最小 agents 控制面 API
- `POST /api/platform/projects/workspace-binding/list|detail|upsert` 提供最小项目工作区绑定 API
- `POST /api/platform/agents/governance-overview|waiting/list|collaboration-dashboard|handoffs/list` 提供最小治理摘要、父任务协作分组与 handoff 时间线 API
- `POST /api/platform/oncall/summary` 提供最小值班建议汇总 API
- `POST /api/platform/work-items/list|detail|dispatch|respond|escalate|cancel` 提供最小 work-items 协作主链 API
- `POST /api/platform/agents/mailbox/list|pull|ack|respond` 提供最小 mailbox 读写 API
- `POST /api/platform/runs/list|detail` 提供最小 recent runs 读面
- `POST /api/platform/worker/runs/pull|update|complete` 提供最小 Worker 执行回传 API，其中 `pull` 已能把 `queued work-item` 自动转成 `run + execution lease`
- `./themis-platform auth platform list|add|remove|rename` 提供平台服务令牌的最小本地治理入口
- `./themis-platform doctor worker-fleet` 提供 Worker Fleet 巡检摘要
- `./themis-platform worker-fleet <drain|offline|reclaim>` 提供最小节点治理 CLI
- 其余 `/api/*` 统一返回共享 `PLATFORM_ROUTE_NOT_FOUND`

## 部署前提

- 当前仓仍通过 `file:../themis-contracts` 依赖共享契约；真实部署时需要把 `themis-contracts` 作为 sibling repo 放到同一级目录，再执行 `npm ci`。
- `src/server/platform-main.ts` 现在会先读取仓库根目录 `.env/.env.local`，并按 `THEMIS_HOST` / `THEMIS_PORT` 启动；默认监听已改成 `0.0.0.0:3100`，不再固定写死 `127.0.0.1:3200`。
- 平台 Web 登录口令当前通过环境变量 `THEMIS_PLATFORM_WEB_ACCESS_TOKEN`（可选 `THEMIS_PLATFORM_WEB_ACCESS_TOKEN_LABEL`）提供；平台服务 Bearer token 仍由 `infra/local/platform-service-tokens.json` 承载。
- 独立平台仓当前还支持本地 runtime snapshot：`src/server/platform-main.ts` 会默认把 `nodes / control-plane / workflow / worker-runs` 状态落到 `infra/platform/runtime-state.json`；如需自定义路径，可配置 `THEMIS_PLATFORM_RUNTIME_SNAPSHOT_FILE`。
- 平台常驻建议直接使用根目录 `./themis-platform` 或 `npm run start:platform`，不要再借主仓 `./themis` 的兼容入口。
- 平台机本地运行态会写入 `infra/local/` 与 `infra/platform/`，这两个目录已经加入 `.gitignore`，不应纳入版本控制。

## 部署文档

- `docs/themis-platform-systemd-service.md`
- `infra/systemd/themis-platform.service.example`

当前验证：

- `npm run test`
- `npm run typecheck`
- `npm run build`

当前边界：

- `auth platform` 首版当前使用本地 `infra/local/platform-service-tokens.json` 保存平台服务令牌元数据，后续再和平台持久化控制面打通。
- `doctor worker-fleet` 与 `worker-fleet` 已迁入独立平台仓，但当前仍只覆盖最小节点值班与治理闭环。
- 当前治理页已覆盖最小 `agents + projects + governance-overview + waiting/list + collaboration-dashboard + handoffs/list + oncall/summary + work-items + mailbox + recent runs`。
- 当前 `platform-main` 已具备真实部署入口和最小 `Web Access + Bearer` 鉴权语义，但平台事实仍是 in-memory；后续还需继续迁入 MySQL shared control plane 与 scheduler/runtime 主链，才能替换现网平台服务。
- 当前 scheduler/runtime 主链已补入第一刀：`worker pull` 会根据节点所属组织挑选最高优先级 `queued work-item`，并优先使用 `projects/workspace-binding` 里的 `lastActiveWorkspacePath / canonicalWorkspacePath` 生成执行合同；但平台事实仍是 in-memory，尚未接入现网 MySQL shared control plane。
- 当前 scheduler/runtime 主链已补入第二刀：`platform-main` 现在会按 `THEMIS_PLATFORM_SCHEDULER_INTERVAL_MS` 定期运行 `scheduler tick`，自动回收 `offline / draining` 节点上的 active lease，并把对应 work-item 重新排回 `queued`，供后续在线节点重新拉取；当前剩余主阻塞已收敛到 MySQL shared control plane 与 runtime 持久化。
- 当前 runtime 持久化已补入第一刀：平台路由上的状态变更现在会触发本地 snapshot 落盘，`platform-main` 重启后也会从 `runtime-state.json` 恢复 `nodes / control-plane / workflow / worker-runs` 这四束平台事实；当前剩余主阻塞已进一步收敛到 `MySQL shared control plane` 与真正的 `runtime store / execution runtime` 接线。

下一步应优先把本地 token 存储与平台服务端鉴权事实继续收口到同一控制面，再逐步把当前 in-memory 平台事实换成真实持久化控制面。
