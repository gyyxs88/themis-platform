# themis-platform systemd 用户服务说明

## 目标

把独立 `themis-platform` 仓挂到 `systemd --user` 下常驻运行，并让它以“平台进程 + 本地运行态目录”的方式提供独立平台控制面。

这条链路和主 Themis 不同：

- 它的仓库是 `gyyxs88/themis-platform`
- 它的入口是 `npm run start:platform`
- 它的 CLI 是仓库根目录 `./themis-platform`
- 它当前仍依赖 sibling repo `../themis-contracts`

仓库里已经提供了模板：

```text
infra/systemd/themis-platform.service.example
```

## 推荐目录

建议把平台层代码和共享契约放到同级目录：

```text
~/services/themis-contracts
~/services/themis-platform
```

这是当前 `package.json` 里 `file:../themis-contracts` 的真实前提；如果只拉 `themis-platform` 单仓，`npm ci` 会直接失败。

## 1. 获取代码

```bash
mkdir -p ~/services
git clone git@github.com:gyyxs88/themis-contracts.git ~/services/themis-contracts
git clone git@github.com:gyyxs88/themis-platform.git ~/services/themis-platform
cd ~/services/themis-platform
npm ci
npm run build
```

## 2. 准备平台配置

至少在 `.env.local` 里确认下面这些键：

```bash
THEMIS_HOST=0.0.0.0
THEMIS_PORT=3100
```

如果这台平台机还会承接本地平台服务令牌存储和运行态目录，当前会用到：

```bash
infra/local/platform-service-tokens.json
infra/platform/
```

这些目录已经被 `.gitignore` 忽略，应该只当作本机运行态。

如果平台机启用了 `ufw` 且默认 `deny incoming`，还要额外放行平台端口给局域网：

```bash
sudo ufw allow from 192.168.31.0/24 to any port 3100 proto tcp
```

## 3. 先做一次前台启动验证

正式挂常驻前，先前台跑一次：

```bash
cd ~/services/themis-platform
npm run start:platform
```

至少确认：

- `GET /api/health` 能返回 `{"ok":true,"service":"themis-platform"}`
- `GET /` 能打开独立平台页
- `./themis-platform auth platform list` 能正常读取本地令牌仓

## 4. 安装 systemd 用户服务

先复制模板：

```bash
mkdir -p ~/.config/systemd/user
cp ~/services/themis-platform/infra/systemd/themis-platform.service.example \
  ~/.config/systemd/user/themis-platform.service
```

至少检查这两项：

- `WorkingDirectory`
- `ExecStart`

模板默认内容是：

```ini
[Service]
WorkingDirectory=%h/services/themis-platform
ExecStart=/usr/bin/npm run start:platform
```

如果你的 `npm` 不在 `/usr/bin/npm`，先执行：

```bash
which npm
```

再把 `ExecStart` 改成真实绝对路径。

## 5. 启用常驻

```bash
systemctl --user daemon-reload
systemctl --user enable --now themis-platform.service
```

如果希望退出图形会话或 SSH 断开后仍继续运行，再执行：

```bash
loginctl enable-linger "$USER"
```

## 6. 验证

先看服务状态：

```bash
systemctl --user status themis-platform.service
journalctl --user -u themis-platform.service -f
```

再跑最小平台验证：

```bash
curl -sS http://127.0.0.1:3100/api/health
./themis-platform auth platform list
./themis-platform doctor worker-fleet \
  --platform http://127.0.0.1:3100 \
  --owner-principal <principalId> \
  --token <platformToken>
```

如果 `worker-fleet` 返回 `Owner principal not found.`，优先检查：

- Bearer 令牌绑定的 `ownerPrincipalId`
- 平台当前控制面里是否已经存在该 owner principal 对应的基础事实

## 7. 回退

如果常驻失败，优先：

1. `systemctl --user stop themis-platform.service`
2. 前台执行 `npm run start:platform` 看直接报错
3. 确认 `../themis-contracts` 是否还在 sibling 位置
4. 确认 `.env.local`、`infra/local/`、`infra/platform/` 是否被误删或权限异常
