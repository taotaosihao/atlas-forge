# Phase 1 结论：Manifest 与 Release Identity

- task_id: `20260710-004-atlas-forge`
- phase: `1`
- verdict: `passed`
- tested_codex_cli_version: `0.144.0`
- prompt_length_unit: `unicode_code_points`
- history_scope: `head_ancestry`
- reuse_history_scope: `base_ancestry`
- atlas_plugin_version: `0.1.0+codex.20260709185835`

## 完成内容

- 新增只读 `atlas-plugin-integrity`，提供 manifest、release 和 layout 三个 JSON 模式。
- Manifest 收敛为 3 个 prompt，长度为 `52/122/116` code points；strict SemVer、canonical interface/defaultPrompt、3/128 均 fail closed。
- Release gate 检测未 bump tree、HEAD ancestry 同版异 tree、base ancestry 历史 version 复用和 non-ancestor base。
- Layout gate 检查 source/snapshot/exact cache 的 manifest、完整 tree、expected commit 和 scoped clean status，并拒绝 `latest` 与 exact-version symlink。
- Tree identity 包含 path、mode、content 和 symlink target，使用 UTF-8 byte ordering；source/cache 中额外 `.git` 也会造成 mismatch。

## 独立复核修复

Native reviewer/verifier 在初版发现并推动修复：

- stale phase base 漏扫 HEAD identity。
- non-ancestor base 绕过。
- 历史 version+原 tree 被错误允许复用。
- clean committed bump 被 version-reuse 规则误杀。
- 已有历史 collision 在当前 no-op 时被错误 grandfather。
- exact-version cache symlink 指向 `latest`。
- 非 canonical SemVer、`default_prompt` alias、缺 interface/defaultPrompt。
- 全层级忽略 `.git` 与 locale-dependent path sorting。

上述问题均已进入 hermetic regression fixtures，最终 verdict 为 `clean for the Phase 1 keeper commit`。

## 验证

- `bash workflow/tests/contract_atlas_plugin_integrity.sh`：35 个检查全部通过。
- `atlas-plugin-integrity manifest --plugin-root plugins/atlas-workflow`：`ok=true`。
- `atlas-plugin-integrity release --repo "$PWD" --base 3f78400`：`ok=true`，tree/version 均已改变，当前 version 在 HEAD/base ancestry 中无既有关联。
- 官方 `validate_plugin.py`：通过。
- `node --check`、两个 shell `bash -n`、`git diff --check`：通过。
- Codex `0.144.0` 隔离 app-server：128 emoji prompt 被接受，129 code points 被过滤，证明 runtime 采用 code-point 口径。
- Changed paths、repo tree 和 immutable runtime fingerprints 均证明 Multica 未被本 phase 修改。

## 已知边界

- History proof 只声明 HEAD/base ancestry，不声明其他 refs、远端 refs 或 shallow clone 之外的历史。
- Build metadata 是完整 identity，但不是标准 SemVer precedence；downgrade ordering 属于 Phase 2。
- 未执行 marketplace upgrade、plugin add 或正式 cache 写入。
- 完整 `workflow/tests/contract.sh` 后半段仍受既有真实 host-cache drift 影响；本 phase 只声明 targeted suite clean，不声明全量回归 clean。
- 主机已有 Multica listener 持续写 guard heartbeat；零修改硬门禁使用 repo tree 与 immutable installed surface，而不是易产生假阳性的 whole-runtime hash。
