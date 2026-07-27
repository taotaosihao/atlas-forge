# Over-budget execution contract v3

task_id: fixture-v3-over-budget
contract_semantics_version: 3

```atlas-execution-plan+json
{
  "schema_version": 1,
  "size_policy": { "policy_id": "atlas-slice-size-v1" },
  "slices": [
    {
      "slice_id": "oversized",
      "objective": "Demonstrate split-required admission.",
      "depends_on": [],
      "keeper_outputs": ["event:oversized:ready"],
      "owned_paths": ["src/one/**", "src/two/**"],
      "forbidden_paths": [],
      "acceptance_refs": ["AC-OVERSIZED"],
      "risk_class": "high",
      "failure_domain": "oversized-slice",
      "rollback_boundary": "one logical commit",
      "budget": { "max_changed_files": 1, "max_loc": 100, "max_wall_clock_minutes": 30, "max_required_checks": 1 },
      "checks": [
        { "check_id": "oversized-contract", "gate_class": "contract", "command": "true", "final_only": false, "cache_policy": "identity-bound" }
      ]
    }
  ]
}
```
