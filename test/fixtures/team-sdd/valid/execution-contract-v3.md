# Execution contract v3

task_id: fixture-v3
contract_semantics_version: 3

```atlas-execution-plan+json
{
  "schema_version": 1,
  "size_policy": { "policy_id": "atlas-slice-size-v1" },
  "slices": [
    {
      "slice_id": "slice-one",
      "objective": "Produce the first keeper output.",
      "depends_on": [],
      "keeper_outputs": ["event:slice-one:ready"],
      "owned_paths": ["src/one/**"],
      "forbidden_paths": ["src/two/**"],
      "acceptance_refs": ["AC-V3-1"],
      "risk_class": "medium",
      "failure_domain": "first-slice",
      "rollback_boundary": "one logical commit",
      "budget": { "max_changed_files": 4, "max_loc": 400, "max_wall_clock_minutes": 60, "max_required_checks": 2 },
      "checks": [
        { "check_id": "slice-one-contract", "gate_class": "contract", "command": "true", "final_only": false, "cache_policy": "identity-bound" }
      ]
    },
    {
      "slice_id": "slice-two",
      "objective": "Consume the first keeper output.",
      "depends_on": ["slice-one"],
      "keeper_outputs": ["event:slice-two:ready"],
      "owned_paths": ["src/two/**"],
      "forbidden_paths": ["src/one/**"],
      "acceptance_refs": ["AC-V3-2"],
      "risk_class": "high",
      "failure_domain": "second-slice",
      "rollback_boundary": "one logical commit",
      "budget": { "max_changed_files": 4, "max_loc": 400, "max_wall_clock_minutes": 60, "max_required_checks": 2 },
      "checks": [
        { "check_id": "slice-two-contract", "gate_class": "contract", "command": "true", "final_only": false, "cache_policy": "identity-bound" }
      ]
    },
    {
      "slice_id": "slice-three",
      "objective": "Consume the second keeper output.",
      "depends_on": ["slice-two"],
      "keeper_outputs": ["event:slice-three:ready"],
      "owned_paths": ["docs/three/**"],
      "forbidden_paths": [],
      "acceptance_refs": ["AC-V3-3"],
      "risk_class": "low",
      "failure_domain": "third-slice",
      "rollback_boundary": "one logical commit",
      "budget": { "max_changed_files": 4, "max_loc": 400, "max_wall_clock_minutes": 60, "max_required_checks": 2 },
      "checks": [
        { "check_id": "slice-three-contract", "gate_class": "contract", "command": "true", "final_only": false, "cache_policy": "identity-bound" }
      ]
    }
  ]
}
```
