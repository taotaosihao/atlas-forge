# Valid contract with fenced examples

contract_semantics_version: 1
work_type: docs-only
first_code_guard: not_applicable
first_code_not_applicable_reason: This task documents the semantic contract without changing implementation behavior.
product_ui_gate: not_applicable
product_ui_not_applicable_reason: Documentation examples do not create a served UI workflow.

## Example only

```text
contract_semantics_version: 2
work_type: implementation
first_code_guard: required
```

~~~text
product_ui_gate: required
- browser_entrypoint: file:///tmp/example.html
~~~

<!--
work_type: implementation
first_code_guard: required
product_ui_gate: required
-->

    - browser_entrypoint: file:///tmp/indented-code.html
