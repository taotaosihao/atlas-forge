# 远端 Agent 部署手册

本文用于其他主机上的 agent 部署 Atlas Forge。目标是让新主机拿到仓库后，
可以安装 Codex marketplace、Atlas workflow helper、Codex 插件和 Multica
agent 资产，并用明确命令验证部署结果。

## 适用范围

本手册覆盖：

- 从 GitHub SSH marketplace 安装 `atlas-workflow`、`mempalace`、
  `multica-sdlc` 三个 Codex 插件。
- 同步 Atlas workflow helper 到 `~/.codex/workflow`。
- 同步 Multica agent skill、instruction 和命令包装器到 `~/.agents`。
- 在远端 agent 主机上执行更新、验证和故障排查。

本手册不覆盖生产系统发布、业务仓库应用部署、Multica 账号创建、Codex CLI
安装包分发或密钥托管方案。

## 成功状态

部署成功后，远端主机上的目标系统用户应满足：

- `codex plugin list --marketplace atlas-forge --available --json` 能看到
  `atlas-workflow`、`mempalace`、`multica-sdlc`。
- `~/.codex/workflow/bin/codex-workflow self-test` 通过。
- `~/.agents/skills/multica-agent-plan` 和
  `~/.agents/skills/multica-prd-submit` 存在。
- `~/.agents/multica-sdlc/instructions/leader.md` 存在。
- `multica-prd-submit` 能从 `PATH` 找到，或可通过
  `~/.agents/bin/multica-prd-submit` 调用。

Codex 技能在新线程启动时加载。安装或更新后，必须启动新的 Codex thread。

## 前置条件

在目标主机上先确认：

```bash
command -v git
command -v python3
command -v codex
ssh -T git@github.com || true
git ls-remote git@github.com:taotaosihao/atlas-forge.git HEAD
```

`ssh -T` 可能返回 GitHub 的非交互提示或无 shell 提示，只要不是
`Permission denied (publickey)` 即可。`git ls-remote` 必须能读取
`atlas-forge`。

如果主机只运行 Multica wrapper，还需要：

```bash
command -v multica || test -n "${MULTICA_BIN:-}"
```

## 标准全量部署

在目标 agent 的系统用户下执行。不要用一个用户安装后假设另一个用户自动可用，
因为 Codex 配置、插件缓存、workflow helper 和 `~/.agents` 默认都在当前
`$HOME` 下。

```bash
bash -lc 'set -euo pipefail
tmp="$(mktemp -d)"
trap "rm -rf \"$tmp\"" EXIT
git clone --depth 1 --branch "${ATLAS_FORGE_REF:-main}" \
  "${ATLAS_FORGE_SOURCE:-git@github.com:taotaosihao/atlas-forge.git}" \
  "$tmp/atlas-forge"
"$tmp/atlas-forge/scripts/install-atlas-forge.sh"'
```

安装脚本会执行这些动作：

- 注册或替换名为 `atlas-forge` 的 Git marketplace。
- 执行 `codex plugin marketplace upgrade atlas-forge`。
- 安装 `atlas-workflow@atlas-forge`、`mempalace@atlas-forge`、
  `multica-sdlc@atlas-forge`。
- 同步 `workflow/` 到 `~/.codex/workflow`。
- 同步 `.agents/` 中的 agent 资产到 `~/.agents`。
- 刷新 `~/.local/bin` 下的 `codex-workflow`、`codex-design-review`、
  `codex-refresh-local-plugin`、`multica-prd-submit` 命令 shim。
- 运行 `codex-workflow self-test`。

如果目标主机已经有旧的本地路径 marketplace，安装脚本会移除旧配置并改成
SSH Git marketplace。

## 非默认目录部署

当 agent runtime 使用隔离目录或服务账号时，用环境变量显式指定安装位置：

```bash
export CODEX_HOME_ROOT="/srv/agents/atlas/.codex"
export AGENTS_HOME="/srv/agents/atlas/.agents"
export LOCAL_BIN_ROOT="/srv/agents/atlas/bin"
export ATLAS_FORGE_REF="main"
export ATLAS_FORGE_SOURCE="git@github.com:taotaosihao/atlas-forge.git"

mkdir -p "$CODEX_HOME_ROOT" "$AGENTS_HOME" "$LOCAL_BIN_ROOT"
export PATH="$LOCAL_BIN_ROOT:$PATH"

bash -lc 'set -euo pipefail
tmp="$(mktemp -d)"
trap "rm -rf \"$tmp\"" EXIT
git clone --depth 1 --branch "$ATLAS_FORGE_REF" "$ATLAS_FORGE_SOURCE" "$tmp/atlas-forge"
"$tmp/atlas-forge/scripts/install-atlas-forge.sh"'
```

如果 Codex 使用 `CODEX_HOME` 而不是 `CODEX_HOME_ROOT`，保持两者一致：

```bash
export CODEX_HOME="$CODEX_HOME_ROOT"
```

`LOCAL_BIN_ROOT` 必须在运行 agent 的 `PATH` 中。否则可以直接调用
`$CODEX_HOME_ROOT/workflow/bin/codex-workflow` 和
`$AGENTS_HOME/bin/multica-prd-submit`。

## 仅刷新 Agent 资产

如果只改了 `.agents/` 中的 skill、instruction 或 wrapper，并且目标主机已经
有最新 checkout，可以只刷新 agent 资产：

```bash
git -C /path/to/atlas-forge pull --ff-only
AGENTS_HOME="${AGENTS_HOME:-$HOME/.agents}" \
LOCAL_BIN_ROOT="${LOCAL_BIN_ROOT:-$HOME/.local/bin}" \
  /path/to/atlas-forge/scripts/sync-live-agents.sh
```

这不会更新 Codex marketplace snapshot，也不会安装插件。插件或 workflow helper
变化时，使用全量部署或更新流程。

## 部署验证

全量部署后执行：

```bash
set -euo pipefail

codex plugin list --marketplace atlas-forge --available --json \
  | python3 -c 'import json,sys
data=json.load(sys.stdin)
items=data if isinstance(data, list) else data.get("installed", [])+data.get("available", [])
names={item["name"] for item in items}
missing={"atlas-workflow","mempalace","multica-sdlc"}-names
raise SystemExit("missing plugins: "+", ".join(sorted(missing)) if missing else 0)'

"${CODEX_HOME_ROOT:-${CODEX_HOME:-$HOME/.codex}}/workflow/bin/codex-workflow" self-test
test -d "${AGENTS_HOME:-$HOME/.agents}/skills/multica-agent-plan"
test -d "${AGENTS_HOME:-$HOME/.agents}/skills/multica-prd-submit"
test -f "${AGENTS_HOME:-$HOME/.agents}/multica-sdlc/instructions/leader.md"
test -x "${AGENTS_HOME:-$HOME/.agents}/bin/multica-prd-submit"

if ! command -v multica-prd-submit >/dev/null 2>&1; then
  echo "warning: multica-prd-submit shim is not on PATH" >&2
fi
```

如果目标主机要提交 Multica issue，再验证 wrapper：

```bash
MULTICA_BIN="${MULTICA_BIN:-$(command -v multica || true)}" \
  "${AGENTS_HOME:-$HOME/.agents}/bin/multica-prd-submit" --help
```

## 更新已部署主机

优先使用 marketplace snapshot 中的安装脚本：

```bash
~/.codex/.tmp/marketplaces/atlas-forge/scripts/install-atlas-forge.sh
```

非默认 `CODEX_HOME_ROOT` 时使用对应路径：

```bash
"${CODEX_HOME_ROOT:-${CODEX_HOME:-$HOME/.codex}}/.tmp/marketplaces/atlas-forge/scripts/install-atlas-forge.sh"
```

更新后重新运行部署验证，并启动新的 Codex thread。

## 多用户或多 Agent 主机

每个运行 agent 的系统用户都要执行一次安装，或显式指定共享的
`CODEX_HOME_ROOT`、`AGENTS_HOME` 和 `LOCAL_BIN_ROOT`。共享目录时需要保证所有
agent 用户都有读权限；会写入运行状态的路径还需要写权限，例如：

- `~/.codex/plugins/cache`
- `~/.codex/workflow`
- `~/.agents/multica-sdlc/agent-scorecards.jsonl`
- `~/.agents/multica-sdlc/agent-scorecards.lock`

不要把本机的 token、会话日志、task runtime、lock 文件或插件 cache 直接复制到
其他主机。远端主机应使用自己的 Codex、GitHub、Multica 和模型供应商凭据。

## 常见故障

### `Permission denied (publickey)`

目标主机没有 GitHub SSH 权限。修复 SSH key 后重新验证：

```bash
git ls-remote git@github.com:taotaosihao/atlas-forge.git HEAD
```

### `missing required command: codex`

先安装 Codex CLI，并确认运行 agent 的用户能从 `PATH` 找到：

```bash
command -v codex
codex plugin --help
```

### `multica-prd-submit` 不在 `PATH`

确认 shim 已生成，并把目录加入 `PATH`：

```bash
test -x "${LOCAL_BIN_ROOT:-$HOME/.local/bin}/multica-prd-submit"
export PATH="${LOCAL_BIN_ROOT:-$HOME/.local/bin}:$PATH"
```

也可以直接调用：

```bash
"${AGENTS_HOME:-$HOME/.agents}/bin/multica-prd-submit" --help
```

### 技能更新后 Codex 看不到

先更新部署，再启动新的 Codex thread：

```bash
"${CODEX_HOME_ROOT:-${CODEX_HOME:-$HOME/.codex}}/.tmp/marketplaces/atlas-forge/scripts/install-atlas-forge.sh"
```

Codex 技能不是在旧 thread 中热加载的。

### Marketplace 指向旧本地路径

重新运行安装脚本即可。需要手动修复时：

```bash
codex plugin marketplace remove atlas-forge
codex plugin marketplace add --ref main git@github.com:taotaosihao/atlas-forge.git
codex plugin marketplace upgrade atlas-forge
codex plugin add atlas-workflow@atlas-forge
codex plugin add mempalace@atlas-forge
codex plugin add multica-sdlc@atlas-forge
```

随后重新同步 workflow 和 agent 资产：

```bash
/path/to/atlas-forge/scripts/sync-live-workflow.sh
```
