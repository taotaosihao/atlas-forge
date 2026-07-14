Review complete.

REVIEW_VERDICT_JSON
```json
{
  "schema_version": 2,
  "task_id": "fixture",
  "slice_id": "slice-001",
  "base_sha": "1111111111111111111111111111111111111111",
  "head_sha": "2222222222222222222222222222222222222222",
  "spec_compliance": "pass",
  "task_quality": "pass",
  "issues": [
    {
      "finding_id": "finding-doc-note",
      "severity": "Minor",
      "category": "documentation",
      "path": "brief.json",
      "line": 1,
      "evidence": "The fixture retains one visible review finding.",
      "required_fix": "If admitted, clarify the fixture documentation."
    }
  ],
  "cannot_verify_from_diff": [
    {
      "gap_id": "gap-runtime",
      "description": "Runtime evidence is intentionally absent from this validation fixture."
    }
  ],
  "strengths": ["Schema v2 finding and evidence-gap identities are explicit."],
  "reviewed_inputs": {
    "brief_json": "brief.json",
    "diff": "local"
  }
}
```
