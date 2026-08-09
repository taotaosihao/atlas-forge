# Atlas 3D Harness v0.1 最终实施合同（source-checkout exploration）

task_id: 20260802-001-atlas-3d-harness-v0-1
contract_semantics_version: 3
finding_scope_admission: controller_current_required_only
safe_fallback_authority: none
work_type: implementation
first_code_guard: required
first_code_not_applicable_reason:
product_ui_gate: required
product_ui_not_applicable_reason:

## 执行授权与候选分类

- 执行授权：实现授权为`user-message:complete-contract-20260801`，对应用户原文“使用goal + team开始实施完整合同，下载安装软件不需要询问我，目标是完成合同”；replacement task重新绑定与正式验收授权为`user-message:replacement-task-20260802`，对应用户原文“replacement task”。
- 候选分类：`exploration`。v0.1 只声明当前 source checkout 和当前本机 Mac 可执行，不声明 installed-ready、release-ready 或生产可用。
- 允许动作：修改本合同拥有的源码、测试和仓库文档；安装锁定 npm 依赖；下载 Playwright-managed Chromium；运行当前 Mac 本地测试和 loopback 浏览器验证。
- 不允许动作：切换或创建分支、创建 worktree、覆盖或暂存既有 dirty changes、commit、push、PR、plugin/cache refresh、发布、部署、真实 marketplace mutation、Multica mutation或生产/登录态页面访问。
- 唯一范围源：本文件。此前的 `clarify.md` 在本合同 strict lint 和 Team execute admission 后只保留审查背景与本文件指针。

## Execution Plan

```atlas-execution-plan+json
{
  "schema_version": 1,
  "size_policy": {
    "policy_id": "atlas-slice-size-v2"
  },
  "slices": [
    {
      "slice_id": "slice-web-kernel-context",
      "objective": "修复当前 Mac 的 Web Acceptance 原样基线，增加最小 opt-in run-context@1，并以 3D facade 的 stub worker 直接导入同 checkout kernel，证明 legacy 字节兼容和 current-attempt 可重验 authority。",
      "depends_on": [],
      "keeper_outputs": [
        "kernel:run-context@1"
      ],
      "owned_paths": [
        "workflow/bin/lib/codex-web-acceptance/core.js",
        "workflow/bin/lib/codex-web-acceptance/contracts/project-config.schema.json",
        "workflow/bin/lib/codex-web-acceptance/contracts/validator-input.schema.json",
        "workflow/bin/lib/codex-web-acceptance/contracts/types.d.ts",
        "workflow/tests/contract_web_acceptance.sh",
        "plugins/atlas-workflow/tools/atlas-3d-harness/src/kernel-integration/**",
        "plugins/atlas-workflow/tools/atlas-3d-harness/test/kernel-integration/**"
      ],
      "forbidden_paths": [
        "docs/atlas-workflow/20260731-003-atlas-3d-harness/implementation-contract.final.md",
        "workflow/bin/lib/codex-workflow/team/admission.js",
        "workflow/bin/lib/codex-workflow/team/slice-acceptance.js",
        "workflow/bin/lib/codex-workflow/verification/required-gates.js",
        "workflow/bin/lib/codex-workflow/verification/runner.js",
        "workflow/tests/js/team-commands.test.js",
        "workflow/tests/js/verification-runner.test.js",
        "workflow/bin/lib/codex-workflow/team/owned-path.js",
        "plugins/multica-sdlc/**",
        ".agents/**",
        ".codex/**",
        "plugins/cache/**",
        "cache/**",
        "workflow/artifacts/**",
        "plugins/atlas-workflow/.codex-plugin/plugin.json",
        "scripts/update-atlas-workflow-marketplace",
        "scripts/update-atlas-workflow-plugin",
        "scripts/bump-plugin-cachebuster.sh"
      ],
      "acceptance_refs": [
        "G-005",
        "AC-001"
      ],
      "risk_class": "high",
      "failure_domain": "shared-web-acceptance-envelope-and-direct-kernel-import",
      "rollback_boundary": "仅回退本 slice 的未提交精确 hunks；不得覆盖既有 dirty paths或使用破坏性 Git 命令。",
      "estimate": {
        "estimated_changed_files": 9,
        "estimated_net_loc": 700,
        "target_p90_minutes": 180,
        "serial_dependency_depth": 0,
        "independent_vertical_count": 1
      },
      "budget": {
        "max_changed_files": 12,
        "max_loc": 1200,
        "max_wall_clock_minutes": 300,
        "max_required_checks": 4
      },
      "checks": [
        {
          "check_id": "web-acceptance-contract",
          "gate_class": "contract",
          "command": "bash workflow/tests/contract_web_acceptance.sh",
          "final_only": false,
          "cache_policy": "fresh-executed"
        },
        {
          "check_id": "web-acceptance-core-syntax",
          "gate_class": "lint",
          "command": "node --check workflow/bin/lib/codex-web-acceptance/core.js",
          "final_only": false,
          "cache_policy": "fresh-executed"
        },
        {
          "check_id": "atlas-3d-kernel-envelope",
          "gate_class": "integration",
          "command": "node --test plugins/atlas-workflow/tools/atlas-3d-harness/test/kernel-integration/envelope.test.cjs",
          "final_only": false,
          "cache_policy": "fresh-executed"
        }
      ]
    },
    {
      "slice_id": "slice-atlas-3d-runtime",
      "objective": "由一个连续 writer 交付严格 3D 协议、browser transport、bridge lifecycle、base/industrial oracles、valid-but-wrong faults、purpose-specific compare和当前 Mac真实 Three.js thin slice。",
      "depends_on": [
        "slice-web-kernel-context"
      ],
      "keeper_outputs": [
        "runtime:atlas-3d-harness@0.1"
      ],
      "owned_paths": [
        "plugins/atlas-workflow/tools/atlas-3d-harness/.gitignore",
        "plugins/atlas-workflow/tools/atlas-3d-harness/package.json",
        "plugins/atlas-workflow/tools/atlas-3d-harness/package-lock.json",
        "plugins/atlas-workflow/tools/atlas-3d-harness/bin/**",
        "plugins/atlas-workflow/tools/atlas-3d-harness/contracts/**",
        "plugins/atlas-workflow/tools/atlas-3d-harness/src/adapter/**",
        "plugins/atlas-workflow/tools/atlas-3d-harness/src/browser/**",
        "plugins/atlas-workflow/tools/atlas-3d-harness/src/canonical/**",
        "plugins/atlas-workflow/tools/atlas-3d-harness/src/cli/**",
        "plugins/atlas-workflow/tools/atlas-3d-harness/src/compare/**",
        "plugins/atlas-workflow/tools/atlas-3d-harness/src/domain/**",
        "plugins/atlas-workflow/tools/atlas-3d-harness/src/launcher/**",
        "plugins/atlas-workflow/tools/atlas-3d-harness/src/oracles/**",
        "plugins/atlas-workflow/tools/atlas-3d-harness/src/page/**",
        "plugins/atlas-workflow/tools/atlas-3d-harness/src/protocol/**",
        "plugins/atlas-workflow/tools/atlas-3d-harness/src/resources/**",
        "plugins/atlas-workflow/tools/atlas-3d-harness/src/security/**",
        "plugins/atlas-workflow/tools/atlas-3d-harness/src/transport/**",
        "plugins/atlas-workflow/tools/atlas-3d-harness/src/validator/**",
        "plugins/atlas-workflow/tools/atlas-3d-harness/examples/**",
        "plugins/atlas-workflow/tools/atlas-3d-harness/third-party/**",
        "plugins/atlas-workflow/tools/atlas-3d-harness/test/browser/**",
        "plugins/atlas-workflow/tools/atlas-3d-harness/test/domain/**",
        "plugins/atlas-workflow/tools/atlas-3d-harness/test/fixtures/**",
        "plugins/atlas-workflow/tools/atlas-3d-harness/test/integration/**",
        "plugins/atlas-workflow/tools/atlas-3d-harness/test/support/**",
        "plugins/atlas-workflow/tools/atlas-3d-harness/test/transport/**"
      ],
      "forbidden_paths": [
        "docs/atlas-workflow/20260731-003-atlas-3d-harness/implementation-contract.final.md",
        "workflow/bin/lib/codex-workflow/team/admission.js",
        "workflow/bin/lib/codex-workflow/team/slice-acceptance.js",
        "workflow/bin/lib/codex-workflow/verification/required-gates.js",
        "workflow/bin/lib/codex-workflow/verification/runner.js",
        "workflow/tests/js/team-commands.test.js",
        "workflow/tests/js/verification-runner.test.js",
        "workflow/bin/lib/codex-workflow/team/owned-path.js",
        "plugins/multica-sdlc/**",
        ".agents/**",
        ".codex/**",
        "plugins/cache/**",
        "cache/**",
        "workflow/artifacts/**",
        "plugins/atlas-workflow/.codex-plugin/plugin.json",
        "scripts/update-atlas-workflow-marketplace",
        "scripts/update-atlas-workflow-plugin",
        "scripts/bump-plugin-cachebuster.sh"
      ],
      "acceptance_refs": [
        "G-001",
        "G-002",
        "G-003",
        "G-004",
        "G-006",
        "G-007",
        "AC-002",
        "AC-003",
        "AC-004",
        "AC-005",
        "AC-006",
        "AC-007",
        "AC-008",
        "AC-009",
        "AC-010",
        "AC-011",
        "AC-014",
        "AC-015",
        "AC-016"
      ],
      "risk_class": "high",
      "failure_domain": "atlas-3d-runtime-oracles-and-current-mac-browser-safety",
      "rollback_boundary": "仅回退本 slice 新增 runtime、fixtures和tests的未提交变更；S1 kernel foundation保持不动，managed Chromium cache可保留，不修改系统Chrome。",
      "estimate": {
        "estimated_changed_files": 78,
        "estimated_net_loc": 10000,
        "target_p90_minutes": 1440,
        "serial_dependency_depth": 1,
        "independent_vertical_count": 1
      },
      "budget": {
        "max_changed_files": 90,
        "max_loc": 13000,
        "max_wall_clock_minutes": 1920,
        "max_required_checks": 10
      },
      "checks": [
        {
          "check_id": "atlas-3d-dependency-browser-install",
          "gate_class": "install",
          "command": "node plugins/atlas-workflow/tools/atlas-3d-harness/bin/install-managed-browser.cjs",
          "final_only": false,
          "cache_policy": "fresh-executed"
        },
        {
          "check_id": "atlas-3d-unit",
          "gate_class": "unit",
          "command": "npm test --prefix plugins/atlas-workflow/tools/atlas-3d-harness",
          "final_only": false,
          "cache_policy": "fresh-executed"
        },
        {
          "check_id": "atlas-3d-bridge",
          "gate_class": "contract",
          "command": "npm run test:bridge --prefix plugins/atlas-workflow/tools/atlas-3d-harness",
          "final_only": false,
          "cache_policy": "fresh-executed"
        },
        {
          "check_id": "atlas-3d-faults",
          "gate_class": "unit",
          "command": "npm run test:faults --prefix plugins/atlas-workflow/tools/atlas-3d-harness",
          "final_only": false,
          "cache_policy": "fresh-executed"
        },
        {
          "check_id": "atlas-3d-compare",
          "gate_class": "contract",
          "command": "npm run test:compare --prefix plugins/atlas-workflow/tools/atlas-3d-harness",
          "final_only": false,
          "cache_policy": "fresh-executed"
        },
        {
          "check_id": "atlas-3d-browser",
          "gate_class": "browser-flow",
          "command": "npm run test:browser --prefix plugins/atlas-workflow/tools/atlas-3d-harness",
          "final_only": false,
          "cache_policy": "fresh-executed"
        },
        {
          "check_id": "atlas-3d-driver",
          "gate_class": "install",
          "command": "npm run test:driver --prefix plugins/atlas-workflow/tools/atlas-3d-harness",
          "final_only": false,
          "cache_policy": "fresh-executed"
        },
        {
          "check_id": "atlas-3d-isolation",
          "gate_class": "security",
          "command": "npm run test:isolation --prefix plugins/atlas-workflow/tools/atlas-3d-harness",
          "final_only": false,
          "cache_policy": "fresh-executed"
        },
        {
          "check_id": "atlas-3d-launcher",
          "gate_class": "integration",
          "command": "npm run test:launcher --prefix plugins/atlas-workflow/tools/atlas-3d-harness",
          "final_only": false,
          "cache_policy": "fresh-executed"
        }
      ]
    },
    {
      "slice_id": "slice-skill-docs-integration",
      "objective": "在 runtime 行为冻结后交付 source-checkout-only 3D Harness skill与权威文档，阻止开发同步复制node_modules/runtime cache，并在原生Mac和Docker Linux verifier host完成最终集成验证。",
      "depends_on": [
        "slice-atlas-3d-runtime"
      ],
      "keeper_outputs": [
        "skill:atlas-workflow:3d-harness@0.1"
      ],
      "owned_paths": [
        "plugins/atlas-workflow/skills/3d-harness/**",
        "plugins/atlas-workflow/tools/atlas-3d-harness/README.md",
        "plugins/atlas-workflow/README.md",
        "docs/atlas-3d-harness.md",
        "docs/README.md",
        "scripts/update-atlas-workflow-plugin",
        "workflow/tests/integration_atlas_plugin_dev_sync.sh"
      ],
      "forbidden_paths": [
        "docs/atlas-workflow/20260731-003-atlas-3d-harness/implementation-contract.final.md",
        "workflow/bin/lib/codex-workflow/team/admission.js",
        "workflow/bin/lib/codex-workflow/team/slice-acceptance.js",
        "workflow/bin/lib/codex-workflow/verification/required-gates.js",
        "workflow/bin/lib/codex-workflow/verification/runner.js",
        "workflow/tests/js/team-commands.test.js",
        "workflow/tests/js/verification-runner.test.js",
        "workflow/bin/lib/codex-workflow/team/owned-path.js",
        "plugins/multica-sdlc/**",
        ".agents/**",
        ".codex/**",
        "plugins/cache/**",
        "cache/**",
        "workflow/artifacts/**",
        "plugins/atlas-workflow/.codex-plugin/plugin.json",
        "scripts/update-atlas-workflow-marketplace",
        "scripts/bump-plugin-cachebuster.sh"
      ],
      "acceptance_refs": [
        "G-008",
        "AC-012",
        "AC-013"
      ],
      "risk_class": "medium",
      "failure_domain": "skill-docs-and-final-source-integration",
      "rollback_boundary": "仅回退skill、README/docs和开发同步排除规则的未提交当前任务hunks；不得运行cachebuster、refresh或安装态同步。",
      "estimate": {
        "estimated_changed_files": 8,
        "estimated_net_loc": 900,
        "target_p90_minutes": 180,
        "serial_dependency_depth": 2,
        "independent_vertical_count": 1
      },
      "budget": {
        "max_changed_files": 10,
        "max_loc": 1300,
        "max_wall_clock_minutes": 300,
        "max_required_checks": 9
      },
      "checks": [
        {
          "check_id": "atlas-3d-skill-validate",
          "gate_class": "contract",
          "command": "python3 /Users/sihao/.codex/skills/.system/skill-creator/scripts/quick_validate.py plugins/atlas-workflow/skills/3d-harness",
          "final_only": true,
          "cache_policy": "fresh-executed"
        },
        {
          "check_id": "atlas-plugin-validate",
          "gate_class": "contract",
          "command": "python3 /Users/sihao/.codex/skills/.system/plugin-creator/scripts/validate_plugin.py plugins/atlas-workflow",
          "final_only": true,
          "cache_policy": "fresh-executed"
        },
        {
          "check_id": "atlas-plugin-integrity",
          "gate_class": "release-identity",
          "command": "workflow/bin/atlas-plugin-integrity manifest --plugin-root plugins/atlas-workflow",
          "final_only": true,
          "cache_policy": "fresh-executed"
        },
        {
          "check_id": "atlas-markdown-links",
          "gate_class": "lint",
          "command": "scripts/check-relative-markdown-links.py --root .",
          "final_only": true,
          "cache_policy": "fresh-executed"
        },
        {
          "check_id": "atlas-dev-sync-exclusions",
          "gate_class": "integration",
          "command": "bash workflow/tests/integration_atlas_plugin_dev_sync.sh",
          "final_only": true,
          "cache_policy": "fresh-executed"
        },
        {
          "check_id": "atlas-repo-contract",
          "gate_class": "contract",
          "command": "docker run --rm --cap-add SYS_PTRACE --security-opt seccomp=unconfined -v \"$PWD:/source:ro\" -w /workspace node:24-bookworm-slim bash -lc 'apt-get update >/dev/null && apt-get install -y --no-install-recommends git ripgrep strace python3 rsync >/dev/null && mkdir -p /private/tmp && rsync -a --exclude=/.tmp/ --exclude=/plugins/atlas-workflow/tools/atlas-3d-harness/node_modules/ --exclude=/plugins/atlas-workflow/tools/atlas-3d-harness/.local/ --exclude=/plugins/atlas-workflow/tools/atlas-3d-harness/runs/ --exclude=/plugins/atlas-workflow/tools/atlas-3d-harness/artifacts/ --exclude=/plugins/atlas-workflow/tools/atlas-3d-harness/runtime-config.local.json --exclude=/plugins/atlas-workflow/tools/atlas-3d-harness/*.log /source/ /workspace/ && git config --global --add safe.directory /workspace && bash workflow/tests/contract_repo.sh'",
          "final_only": true,
          "cache_policy": "fresh-executed"
        },
        {
          "check_id": "atlas-cross-domain-contract",
          "gate_class": "integration",
          "command": "docker run --rm --cap-add SYS_PTRACE --security-opt seccomp=unconfined -v \"$PWD:/source:ro\" -w /workspace node:24-bookworm-slim bash -lc 'apt-get update >/dev/null && apt-get install -y --no-install-recommends git ripgrep strace python3 rsync >/dev/null && mkdir -p /private/tmp && rsync -a --exclude=/.tmp/ --exclude=/plugins/atlas-workflow/tools/atlas-3d-harness/node_modules/ --exclude=/plugins/atlas-workflow/tools/atlas-3d-harness/.local/ --exclude=/plugins/atlas-workflow/tools/atlas-3d-harness/runs/ --exclude=/plugins/atlas-workflow/tools/atlas-3d-harness/artifacts/ --exclude=/plugins/atlas-workflow/tools/atlas-3d-harness/runtime-config.local.json --exclude=/plugins/atlas-workflow/tools/atlas-3d-harness/*.log /source/ /workspace/ && git config --global --add safe.directory /workspace && bash workflow/tests/contract.sh'",
          "final_only": true,
          "cache_policy": "fresh-executed"
        }
      ]
    }
  ]
}
```

## Scope

- Goal `G-001`：提供严格版本化、引擎无关的页面协议、capability/profile与reset/checkpoint/revision lifecycle。
- Goal `G-002`：让同一fixture、seed、epoch、checkpoint和输入得到可复核的canonical state与same-render PNG证据。
- Goal `G-003`：保持Expected Contract、Actual Observation、Validator-derived Decision独立，并识别合法但错误的3D场景。
- Goal `G-004`：以当前本机Mac、owned loopback launcher、Playwright-managed Chromium和fresh BrowserContext执行受审查本地目标。
- Goal `G-005`：复用唯一`codex-web-acceptance` run/check-run kernel，只增加通用opt-in `run-context@1`，不建设第二套evidence core。
- Goal `G-006`：提供`semantic-state`与受限`render-review`比较，并拒绝pixel/performance或不可验证输入。
- Goal `G-007`：提供vanilla Three.js reference scene、base与industrial fixtures、valid-but-wrong faults及当前Mac真实浏览器thin slice。
- Goal `G-008`：提供source-checkout-only `$atlas-workflow:3d-harness` skill与权威接入文档，不自动执行配置或刷新cache。
- Non-goals：Linux、Windows、Intel Mac、其他Mac、Kivo、installed-ready、production/login pages、malware containment、OS network sandbox、pixel regression、performance、AI visual verdict、资产生成、编辑器、物理引擎、`interaction.hit-test@1`、release/deploy。
- User-visible behavior：用户可在当前checkout校验scenario，运行受审查本地Three.js页面，得到existing-kernel run root与3D check结果，并按明确purpose比较两个通过的run roots；skill解释前置条件、命令、证据和失败边界。

## First Code Slice Guard

- first_code_slice: slice-web-kernel-context
- first_code_slice_kind: workflow
- first_code_owner: 单一Atlas implementer拥有本slice列出的Web Acceptance core/schema/test与最小3D core/package路径，main controller负责integration与验收。
- first_code_verification: 原样运行`bash workflow/tests/contract_web_acceptance.sh`和3D envelope test；验证legacy validator stdin bytes、input digest、checkRun与退出语义golden不变，并由stub worker直接调用同checkout kernel且拒绝wrong-attempt mutation。
- allowed_contract_gate_only_until: implementation contract strict lint、brief-v3生成和Team execute admission完成；之后不得继续只写合同、fixture或evidence而没有行为diff。
- stop_if_no_code_by_phase: slice-web-kernel-context结束前必须出现并验证实际Web Acceptance与3D direct-import行为变更，否则停止execute并报告admission/ownership阻断。
- gate_parallelization_or_deferral_plan: 合同与brief仅由main controller在writer dispatch前完成；只读探索可并行，所有scanner/docs/evidence扩展推迟到首个行为slice通过之后。

## Product/UI Acceptance Gate

- first_operable_user_flow: 用户在当前Mac对`examples/basic-three`运行`atlas-3d-harness run`，真实owned server提供页面与JS assets，managed Chromium完成一个atomic checkpoint并生成canonical state和同revision PNG。
- browser_entrypoint: http://127.0.0.1:41733/
- served_ui_validation_action: Playwright opens browser_entrypoint，等待bridge ready后执行reset和atomic checkpoint，核对实际served main document/adapter bytes、pre/post geometry与bridge revisions并截图；不得fulfill main document或app bundle。
- ui_data_mode: frozen reviewed-local fixture；真实HTML、JavaScript和Three.js assets来自owned loopback HTTP server，route只做外联拒绝而不合成应用资源。
- required_safety_gates: exact current-Mac与driver identity preflight、reviewed-local frozen digests、scrubbed env、HTTP/WebSocket/Service Worker与browser side-effect negative controls、secret scanner、resource caps、PGID cleanup、inner/outer timeout和native check-run incomplete-root rejection全部必需。
- allowed_headless_only_until: slice-web-kernel-context完成；此后runtime slice必须交付真实served UI thin slice，不能用schema、mock或synthetic HTML替代。
- stop_if_no_ui_by_phase: slice-atlas-3d-runtime结束时若真实owned HTTP页面、managed Chromium、checkpoint和same-render PNG未闭合，则停止后续skill/docs集成并报告blocked/cannot_verify。

## Acceptance Criteria

| ID | Criterion | Required | Verification | Authority |
|----|-----------|----------|--------------|-----------|
| AC-001 | 3D facade通过sanitized owned worker直接复用同checkout的`run()/checkRun()`；opt-in `run-context@1`由kernel提供并digest-bind current run/attempt/artifact root/contract；legacy输入逐字节不变，无第二内核。 | yes | Web Acceptance contract、legacy golden、wrong-attempt mutation、3D envelope tests | goal:G-005 |
| AC-002 | scenario、runtime config、3D contract、protocol、capability和profile严格版本化并拒绝未知字段；base-only与industrial字段条件一致，scenario不能注入执行。 | yes | schema/dispatch参数化测试 | goal:G-001 |
| AC-003 | Expected、Actual、Derived独立；adapter不输出verdict；validator仍只输出有界`status/reason`；Page token不持久化，evidence只使用scanner-safe binding。 | yes | fault matrix、secret scanner正反fixtures、envelope检查 | goal:G-003 |
| AC-004 | reset/checkpoint/state/rendered-state/render revisions满足原子、单调、presentation barrier、pending=0和quiet-frame合同，失败不提交且token会失效。 | yes | bridge conformance与mutation tests | goal:G-002 |
| AC-005 | fresh A、A-B-A和第二fresh A canonical digest一致；两次same-token captureTarget与browser geometry pre/post一致，任何截图期漂移使attempt失败且无隐藏重试。 | yes | 当前Mac真实browser replay与drift injection | goal:G-002 |
| AC-006 | exact current-Mac、source layout、driver和frozen input preflight先于server；launcher拥有loopback process group，success/failure/timeout/interrupt后无残留。 | yes | current-Mac launcher、PGID和timeout tests | goal:G-004 |
| AC-007 | 只运行显式确认且digest闭合的`reviewed-local@1`；fresh context拒绝外联、storage、额外page/frame、download、dialog、file chooser和意外navigation，不宣称malware/OS sandbox。 | yes | browser isolation negative controls | goal:G-004 |
| AC-008 | vanilla Three.js真实页面在两个viewport、两个命名视角和至少三个checkpoint生成raw matrices/AABB、transport facts、canonical state和PNG，actual served adapter bytes匹配frozen digest。 | yes | served browser thin slice与resource drift tests | goal:G-007 |
| AC-009 | base validators检查scene/view/timeline/render；只有industrial profile激活时检查joint/socket/attachment，至少六类valid-but-wrong fixtures被独立oracle拒绝。 | yes | base/industrial fault matrix | goal:G-003 |
| AC-010 | run root由existing kernel冻结输入和闭合evidence；native checkRun先行，3D check只收窄；tamper、symlink、path escape、secret、缺文件、重复run-id和unstable不能变为pass。 | yes | native与3D cross-check/tamper fixtures | goal:G-005 |
| AC-011 | compare只接受两个kernel+3D check均通过的完整roots；`semantic-state`与`render-review`按purpose×drift truth table工作，pixel/performance unsupported。 | yes | table-driven compare tests | goal:G-006 |
| AC-012 | skill只从same source checkout定位runtime/core；installed、host/driver mismatch在server前失败；无授权时只说明且不自动安装、下载或执行配置。 | yes | skill validation、source/cache/PATH/driver fixtures | goal:G-008 |
| AC-013 | 权威文档覆盖架构、输入信任、bridge、capabilities、CLI、证据、比较、安全、接入与限制；开发同步明确排除tool-local `node_modules`和runtime cache；安装态、Multica、其他host和既有dirty paths不变。 | yes | Markdown links、plugin validation、dev-sync exclusion contract、forbidden-path audit | goal:G-008 |
| AC-014 | 锁定依赖API/version/integrity/source/license；Chromium记录revision/source/license/path/runtime digest/args；禁止whole-repo vendor。 | yes | lockfile、third-party manifest、browser registry与license audit | goal:G-007 |
| AC-015 | Page只产raw facts，Transport独立测browser facts，Node以不同数学实现和literal expected裁决；base projection与industrial kinematics mutations分开。 | yes | independent-oracle mutation tests | goal:G-003 |
| AC-016 | count/byte/dimension/pixel/response/log/temp/timeout caps联合fail closed；正式run只用tool-derived managed Chromium；outer fatal只留下native check-run拒绝的不完整root。 | yes | current-Mac limit/stream/875-900s/incomplete-root tests | goal:G-004 |

## Real Validation Plan

| Row | Target | Command or action | Expected result | Phase conclusion evidence |
|-----|--------|-------------------|-----------------|---------------------------|
| V-001 | Web Acceptance baseline | `bash workflow/tests/contract_web_acceptance.sh` | 当前Mac原样exit 0且legacy/opt-in行为同时闭合 | Team slice report与原始命令日志（Git外） |
| V-002 | 3D core/envelope/bridge | `npm test && npm run test:envelope && npm run test:bridge`（tool prefix） | schema、worker、bridge和check closure全部通过 | implementer report与测试摘要 |
| V-003 | 3D domain/compare | `npm run test:faults && npm run test:compare`（tool prefix） | base/industrial faults和purpose matrix逐格通过 | reviewer verdict与测试摘要 |
| V-004 | 当前Mac真实浏览器 | 浏览器打开`browser_entrypoint`并运行`npm run test:browser` | real served page、managed Chromium、same-render PNG和served bytes闭合 | Playwright结果与最小截图/evidence manifest（原始日志Git外） |
| V-005 | 安全与生命周期 | `npm run test:driver && npm run test:isolation && npm run test:launcher` | preflight、side effects、limits、timeout和PGID cleanup通过 | verifier report与资源/进程观测摘要 |
| V-006 | skill/plugin/docs | quick_validate、validate_plugin、plugin integrity、Markdown links | source-checkout skill和文档可发现且不修改cache | final phase review |
| V-007 | 跨域仓库 | 在带`strace`的Docker Linux verifier container中原样运行`bash workflow/tests/contract_repo.sh`和`bash workflow/tests/contract.sh` | 仅验证仓库合同且Atlas相关合同通过；不构成Linux harness支持声明，forbidden/Multica fingerprints不变 | final integration verdict |

## Evidence Budget

- Workflow artifacts保留implementation contract、brief/ledger、最小Team结论和一个滚动checkpoint。
- raw npm/Playwright日志、trace、video、HAR、批量PNG、端口/进程观测和失败重试输出全部写到Git外的任务runtime目录或临时目录。
- repo内只提交实现、必要fixtures/tests、一个reference scene和权威用户文档；不把run roots、node_modules或browser cache写入Git。
- 每个phase的持久结论控制在10个文件和1 MB内；需要更多原始证据时只在evidence index登记摘要与外部路径。

## Edge Cases

| Case | Expected behavior | Required | Admission |
|------|-------------------|----------|-----------|
| host不等于冻结current-Mac identity | 在worker/server/browser启动前返回`HOST_UNSUPPORTED`或`HOST_IDENTITY_MISMATCH` | yes | goal:G-004 |
| Playwright package、managed Chromium或identity不匹配 | 返回`DRIVER_UNAVAILABLE`或identity mismatch，绝不fallback系统Chrome | yes | goal:G-004 |
| target未确认reviewed-local或served bytes漂移 | 返回`TARGET_NOT_REVIEWED`或`ADAPTER_IDENTITY_MISMATCH`且不继续capture | yes | goal:G-004 |
| base-only scenario携带或要求industrial字段 | schema拒绝；合法base-only fixture不需要joint/socket/attachment即可通过 | yes | goal:G-003 |
| failed/unstable/tampered run root进入compare | compare拒绝，不生成可比或业务/视觉verdict | yes | goal:G-006 |
| structured evidence出现含token键或secret | existing scanner fail closed；不得放宽scanner | yes | goal:G-005 |
| outer watchdog终止完整PGID | run root保持不完整，由native check-run拒绝，facade不补写控制文件 | yes | goal:G-004 |

## Implementation Notes

- 当前qualified host snapshot：`darwin/arm64`、macOS `26.5.2` build `25F84`、Darwin `25.5.0`、Node `v24.15.0`；实施和最终验收前必须重取证，若身份漂移则更新冻结profile与tests后由Team复审，不自动扩大到其他host。
- `captureToken`只存在Page RPC和adapter memory；持久化`captureBindingId`应对结构化、长度无歧义的字段编码做SHA-256，不使用裸字符串拼接。
- 依赖必须`save-exact`并生成lockfile/third-party manifest；安装脚本不得执行项目任意postinstall，Chromium仅通过Playwright管理入口下载。
- tool-local `node_modules`与repo `.tmp/atlas-3d-harness`浏览器缓存不得进入Git或任何未来开发同步目标；同步排除规则必须有专项合同且本任务不运行实际refresh。
- 当前七个既有dirty paths没有本合同ownership，任何实际overlap立即停止对应writer并由main controller处理。
- implementation agents只写brief拥有路径并返回`IMPLEMENTER_REPORT_JSON`；reviewers/verifiers只读，main controller独占workflow artifacts与最终integration。

## Failure And Stop Conditions

- Stop and ask the user when: 需要覆盖、暂存、回退或吸收既有dirty work；需要commit、push、PR、cache refresh、发布、部署、生产/登录态页面、客户资产/凭据；或解决方案必须扩张到未知/恶意代码的OS-level containment、其他host或新产品能力。
- Treat the task as failed when: exact current-Mac和reviewed-local边界内，existing kernel authority、managed Chromium identity、served adapter binding、same-render capture、independent oracle、resource/timeout/cleanup或native check-run closure无法在最小通用修复后fail closed；不得以mock、wrapper、验证例外或第二内核伪装通过。
- Required safe fallback: not_applicable
- Optional fallback notes: Team可在已授权依赖集合中自行替换库、收窄实现或重写最小模块，但不能降低AC、扩大host/target信任或变更动作权限。

## Provenance

- Based on: `clarify.md` 的v0.1 Team Review收敛版、`analysis.md`、`review-package-v2/review-disposition.md`、`team/decision.md`、用户`user-message:complete-contract-20260801`与replacement授权`user-message:replacement-task-20260802`。
- Supersedes: `clarify.md` 的可执行scope body；原task `20260731-003-atlas-3d-harness`及历史review packages继续只作证据追溯，不提供可搬运的execution receipts。
- Review history: 外部两轮审查后，native acceptance-envelope、browser-macos与scope-acceptance三路最终均`APPROVE`，convergence为`CONSENSUS_WITH_RESERVATIONS`；reservations已投影为本合同必须产生的implementation evidence。

## Finding Provenance

本合同没有把新的review建议直接提升为可执行scope。历史`TR-001`至`TR-012`已经通过用户批准的v0.1 Goal/AC进入当前目标；未来review发现只有经main controller判定为当前goal blocker、当前diff regression或安全/数据/权限阻断时才形成repair，其他均为follow-up。

| Finding ID | Disposition | Source | Follow-up |
|------------|-------------|--------|-----------|
| historical-review-attachments-unavailable | informational | 两轮审查会话提到但本地未取得的附件 | 不阻断；当前合同来自可读取正文、仓库代码和三路Team复审。 |

## Final Contract Cleanliness Gate

- [x] 本文件是最终已同意需求的clean rewrite。
- [x] 被替换的predicted-path、第二kernel、Linux首版和验证例外不作为可执行指令保留。
- [x] review历史只在Provenance中引用，不复制为第二套scope。
- [x] 16条required acceptance与真实验证行完整。
- [x] required rows全部引用`goal:<requirement-ref>`；没有未经controller resolution的`current-required`引用。
- [x] informational finding只留在Finding Provenance。
- [x] raw evidence默认在Git外，repo内只保留必要实现和小型fixture。
- [x] residual risk已转成future runtime verification，而不是未决技术选择。
