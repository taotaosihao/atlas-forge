# 职责边界

本澄清未使用 Team 实施，staffing 不适用。后续实施由主 Codex 负责集成；只在独立工作能明显降低风险或延迟时使用 subagent，不设置固定角色集。

- Team 路由与 agent prompt 修改 owner：主 Codex。
- 合同测试与仓库验证 owner：主 Codex。
- 可选 runtime 抽样校准 owner：主 Codex；`unverified` 不阻塞普通任务。
- 用户决策点：若确认成本失控并需要启用 MultiAgentV2、修改真实用户配置、刷新安装态或提交上游 issue，必须另行授权。
