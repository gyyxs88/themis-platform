# themis-platform

`themis-platform` 是 Themis 的平台控制面与平台后台。

负责平台页面、节点/租约/调度/值班治理，以及 `/api/platform/*` 控制面接口。

- 当前入口：`src/server/platform-main.ts`
- 独立 CLI：仓库根目录 `./themis-platform`
- 当前状态：已具备最小平台页面、`nodes/register|heartbeat|list|detail|drain|offline|reclaim` API、`agents/list|detail|create|card/update|execution-boundary/update|spawn-policy/update|pause|resume|archive` 控制面、`projects/workspace-binding/list|detail|upsert` 项目绑定、`agents/governance-overview|waiting/list|collaboration-dashboard|handoffs/list` 治理读面、`oncall/summary` 值班建议、`work-items/list|detail|dispatch|respond|escalate|cancel` 与 `agents/mailbox/list|pull|ack|respond` 协作读写面、`runs/list|detail` recent runs 读面、`meeting-rooms/list|create|detail|participants/add|messages/create|append-agent-reply|append-agent-failure|resolutions/create|promote|close|terminate` 平台内部会议室控制面、`Web Access + Platform Service Bearer` 鉴权链、`worker/secrets/push|pull|ack` worker secret 下发链路，以及 `worker/runs/pull|update|complete` 自动调度执行链路；当前平台页已新增“会议室观察台”，支持直接查看房间、轮次、消息、结论与参与者，并在必要时强制终止会议，而 `worker pull` 已能把 `queued work-item` 结合项目工作区绑定和节点 `secretCapabilities` 自动分配成新 `run + execution lease`

当前最小能力：

- `GET /` 返回独立平台前端壳
- `GET /platform.js` 与 `GET /platform.css` 返回平台静态资源
- `GET /api/health` 返回 `themis-platform` 服务状态
- `GET /login`、`POST /api/web-auth/login|logout`、`GET /api/web-auth/status` 提供最小平台 Web 登录态
- `POST /api/platform/nodes/register|heartbeat|list|detail|drain|offline|reclaim` 提供最小节点控制面 API
- `POST /api/platform/agents/list|detail|create|card/update|execution-boundary/update|spawn-policy/update|pause|resume|archive` 提供最小 agents 控制面 API
- `POST /api/platform/projects/workspace-binding/list|detail|upsert` 提供最小项目工作区绑定 API
- `POST /api/platform/agents/governance-overview|waiting/list|collaboration-dashboard|handoffs/list` 提供最小治理摘要、父任务协作分组与 handoff 时间线 API
- `POST /api/platform/oncall/summary` 提供最小值班建议汇总 API
- `POST /api/platform/work-items/list|detail|dispatch|respond|escalate|cancel` 提供最小 work-items 协作主链 API
- `POST /api/platform/agents/mailbox/list|pull|ack|respond` 提供最小 mailbox 读写 API
- `POST /api/platform/runs/list|detail` 提供最小 recent runs 读面
- `POST /api/platform/meeting-rooms/list|create|detail|participants/add|messages/create|append-agent-reply|append-agent-failure|resolutions/create|promote|close|terminate` 提供最小平台内部会议室 API
- `POST /api/platform/worker/secrets/push|pull|ack` 提供主 Themis 到指定 Worker Node 的 secret delivery 中转；`push` 不回显 secret 值，`pull` 仅供 worker token 拉取目标节点 pending delivery
- `POST /api/platform/worker/runs/pull|update|complete` 提供最小 Worker 执行回传 API，其中 `pull` 已能把 `queued work-item` 自动转成 `run + execution lease`
- `./themis-platform auth platform list|add|remove|rename` 提供平台服务令牌的最小本地治理入口
- `./themis-platform doctor worker-fleet` 提供 Worker Fleet 巡检摘要
- `./themis-platform worker-fleet <drain|offline|reclaim>` 提供最小节点治理 CLI
- 其余 `/api/*` 统一返回共享 `PLATFORM_ROUTE_NOT_FOUND`

## 部署前提

- 当前仓仍通过 `file:../themis-contracts` 依赖共享契约；真实部署时需要把 `themis-contracts` 放到同级目录，再执行 `npm ci`。
- `src/server/platform-main.ts` 现在会先读取仓库根目录 `.env/.env.local`，并按 `THEMIS_HOST` / `THEMIS_PORT` 启动；默认监听已改成 `0.0.0.0:3100`，不再固定写死 `127.0.0.1:3200`。
- 平台 Web 登录口令当前通过环境变量 `THEMIS_PLATFORM_WEB_ACCESS_TOKEN`（可选 `THEMIS_PLATFORM_WEB_ACCESS_TOKEN_LABEL`）提供；平台服务 Bearer token 仍由 `infra/local/platform-service-tokens.json` 承载。
- `infra/local/platform-service-tokens.json` 只保存平台服务令牌哈希和元数据；如果该文件异常变成空文件，平台会按“暂无令牌”处理，避免鉴权链抛 JSON 解析错误。正式机可用 `infra/local/platform-bootstrap.env` 中保留的 gateway / worker token 通过 `./themis-platform auth platform add ...` 重建令牌元数据；写入时会先写临时文件再原子替换，降低半截文件风险。
- 当前支持本地 runtime snapshot：`src/server/platform-main.ts` 会默认把 `nodes / control-plane / workflow / worker-runs` 状态落到 `infra/platform/runtime-state.json`；如需自定义路径，可配置 `THEMIS_PLATFORM_RUNTIME_SNAPSHOT_FILE`。
- 当前支持本地 execution runtime store：`src/server/platform-main.ts` 会默认把每个 run 的 `assigned-run / state / events` 写到 `infra/platform/runtime-runs/`；如需自定义路径，可配置 `THEMIS_PLATFORM_EXECUTION_RUNTIME_ROOT`。
- 新建 agent 当前会默认落一个 `runtimeProfile(model=gpt-5.5, reasoning=xhigh)`；如需偏离，可继续走 `execution-boundary/update` 覆盖。
- 当前已支持 `THEMIS_PLATFORM_CONTROL_PLANE_DRIVER=mysql`：会把本地 shared cache SQLite 放到 `THEMIS_MANAGED_AGENT_CONTROL_PLANE_DATABASE_FILE`（默认 `infra/platform/control-plane.db`），并通过 `src/server/platform-control-plane-mirror.ts` 在 `shared cache SQLite + MySQL shared snapshot store` 之间做 bootstrap / flush / rollback。
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
- `doctor worker-fleet` 与 `worker-fleet` 当前只覆盖最小节点值班与治理闭环。
- 当前治理页已覆盖最小 `agents + projects + governance-overview + waiting/list + collaboration-dashboard + handoffs/list + oncall/summary + work-items + mailbox + recent runs`。
- 当前平台层已持有内部会议室真相源，会议室状态也会进入 runtime snapshot；主 Themis 只通过 gateway 消费，不在本地持有 room 持久化事实。平台 Web 当前提供会议室观察台和终止会议治理动作，但不承担主持发言；主持与正常收口继续由主 Themis 负责。
- 当前 `platform-main` 已具备真实部署入口、最小 `Web Access + Bearer` 鉴权语义，以及 `mysql` driver 下的 `shared cache SQLite + MySQL shared snapshot store` wiring；平台写动作与 scheduler tick 现在都会先更新本地服务态，再把 shared snapshot flush 到本地 cache 与 MySQL，flush 失败时也会恢复本地 shared cache 和内存态。
- 当前 scheduler/runtime 主链已补入第一刀：`worker pull` 会根据节点所属组织挑选最高优先级 `queued work-item`，并优先使用 `projects/workspace-binding` 里的 `lastActiveWorkspacePath / canonicalWorkspacePath` 生成执行合同；如果执行合同含 `required=true` 的 `secretEnvRefs`，只会分配给 `secretCapabilities` 已声明具备对应 `secretRef` 的节点；这条调度主链现在也会跟随 shared snapshot 一起进入本地 shared cache 与 MySQL mirror。
- 当前 scheduler/runtime 主链已补入第二刀：`platform-main` 现在会按 `THEMIS_PLATFORM_SCHEDULER_INTERVAL_MS` 定期运行 `scheduler tick`，自动回收 `offline / draining` 节点上的 active lease，并把对应 work-item 重新排回 `queued`，供后续在线节点重新拉取；reclaim 后的控制面事实也会一起进入本地 shared cache 与 MySQL mirror。
- 当前 runtime 持久化已补入第一刀：平台路由上的状态变更现在会触发本地 snapshot 落盘，`platform-main` 重启后也会从 `runtime-state.json` 恢复 `nodes / control-plane / workflow / worker-runs` 这四束平台事实。
- 当前 runtime store / execution runtime 已补入第二刀：`worker/runs/pull|update|complete` 与 `scheduler tick reclaim` 现在都会把每个 run 的 `assigned-run.json / state.json / events.ndjson` 写入 `infra/platform/runtime-runs/`。
- 当前最小执行与持久化主链已经具备：平台仓已同时支持 `worker pull 自动调度`、`scheduler tick reclaim`、`runtime snapshot`、`execution runtime store` 和 `shared cache SQLite + MySQL mirror flush`。

后续重点是继续收口真实持久化控制面、令牌元数据与更细粒度治理对象。
