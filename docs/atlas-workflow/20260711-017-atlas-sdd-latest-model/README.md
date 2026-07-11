# Atlas SDD 最新模型约束

本 bundle 锁定 Atlas SDD 自定义 Agent 的 latest-family 选模与防回退边界。当前 catalog 的 5.6 family 只是首个投影；未来出现任意数值更高的 family（无需连续版本号）后，旧投影必须 fail closed。reviewer 使用 frontier/max，其他角色按职责使用 frontier、balanced、fast 变体。

- 当前权威合同：`implementation-contract.final.md`
- 合同入口：`contract-index.md`
- 执行规格：`spec.md`
- 所有者：主 Agent；无独立团队 staffing。

实现已完成，并通过真实 catalog、非连续 6.1 fixture、完整 Atlas 合同和本地安装态同步验证。后续每次 team round 都必须先通过 latest-family 检查。
