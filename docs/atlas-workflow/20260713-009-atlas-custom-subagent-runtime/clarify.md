# 执行澄清

## 原始目标

相对降低 Team 模式的模型成本，而不是绝对限制每个角色或为每次调用建立不可伪造的模型证明。

## 重述要求

保留 Luna/Terra/Sol 的默认偏好，以“少 spawn、少用 Sol、失败时升级”为主要降本手段；运行时可观测性只做低频抽样校准。

## 锁定边界

- 普通实现优先 Luna；常规 review/verify 优先 Terra；确有规划价值或关键判断时优先 Sol。
- 默认模型不等于固定三角色 staffing；小而清晰的任务优先主 Agent 直接完成。
- `unverified` 不是 blocker，不阻止 Team 执行或合同修正。
- 版本升级、agent 配置变化、token 异常或疑似父模型继承时进行一次抽样校准。
- 不建设 runtime smoke CLI、认证复制、metadata parser、Gate A 或长期成本系统。

## 关键反馈

原合同把相对降本升级为严格合规审计，控制成本高于目标收益。修正版只在已确认成本失控时 fail closed。

## 停止条件

确认普通 lane 使用昂贵父模型、出现异常 fan-out、成本明显失控，或需要修改真实用户配置、启用 MultiAgentV2、刷新安装态、发布时停止并请求方向。
