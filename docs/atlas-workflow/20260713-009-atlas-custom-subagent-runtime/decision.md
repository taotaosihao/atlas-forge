# 实施决策

采用“软路由 + 少量硬边界”：Luna/Terra 是高频工作的优先配置，Sol 用于确有价值的规划、关键验收和默认路径未收敛的判断；不机械启动全部角色。

取消 runtime proof 硬前置、Gate A、长期 smoke runner 和临时认证基础设施。模型 metadata 可见时记录，缺失时标记 `unverified` 并继续；只有出现疑似成本信号或用户明确要求时才校准。确认昂贵继承、异常 fan-out 或成本失控时停止新增 fan-out、执行最小只读诊断并安全降级；只有修复需要额外 mutation 或外部动作时才请求授权。

本决策只修正合同，不授权实施 Team、custom-agent、测试、配置或运行时变更。
