# OpenSpec Integration

`chr-governance` complements OpenSpec. It does not replace it.

## Division Of Responsibility

OpenSpec handles:

- Proposal.
- Design.
- Tasks.
- Spec deltas.
- Validation.
- Archive.

`chr-governance` handles:

- Whether OpenSpec artifacts are being treated with the correct authority.
- Whether archived changes are no longer used as current truth.
- Whether long-lived product/contracts/architecture docs need synchronization after a change.
- Whether decisions that should persist beyond an archived change are captured in ADRs or active architecture docs.

## Authority

- `openspec/specs/`: current functional specification, when active and current.
- `openspec/changes/<id>/`: in-flight change material.
- `openspec/changes/archive/`: historical context, not current implementation authority.

After an OpenSpec change is implemented and archived, run `chr:sync` to reconcile durable docs outside OpenSpec when needed.
