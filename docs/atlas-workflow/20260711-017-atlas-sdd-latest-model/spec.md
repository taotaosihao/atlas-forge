# 锁定规格

## 目标

四个 `.codex/agents/atlas-sdd-*.toml` 必须是本地 catalog 最新稳定 GPT family 的当前投影，并按角色区分具体模型与 thinking；team spawn 前检查陈旧投影，尤其明确保护 reviewer。

## 非目标

- 不动态联网发现新模型；使用 Codex 本地 catalog。
- 不修改全局默认模型、推理强度、Multica 或其他 Agent。
- 不刷新 `~/.codex/agents`、插件 cache 或 marketplace。
- 不修改只作为统计输入的历史模型 fixture。

## 决策边界

- 策略保存 frontier/balanced/fast 语义档位，Agent TOML 保存具体可审查投影。
- reviewer=frontier/max、implementer=frontier/high、verifier=balanced/high、explorer=fast/medium。
- catalog 出现更高 family 而投影未升级时，spawn 必须失败；新投影仍需显式审查。

## 验收与验证

1. 当前 5.6 投影匹配 Sol/max、Sol/high、Terra/high、Luna/medium。
2. hermetic 非连续更高 family fixture 会拒绝仍为 5.6 的投影，缺失必需变体也 fail closed。
3. team skill 在 spawn 前调用检查器；reviewer 有显式测试断言。
4. `bash workflow/tests/contract.sh` 与 `git diff --check` 通过，diff 不包含安装态、Multica 或 release 派生产物。

## 假设与下一步

- 接受假设：当前 catalog 中 5.6 是最高稳定 family，Sol/Terra/Luna 分别对应 frontier/balanced/fast。
- 下一步：在后续模型 catalog 变化时，由前置门禁阻止陈旧投影，再显式生成、审查并同步新投影。
