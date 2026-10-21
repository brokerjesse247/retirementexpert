# Advisor workflow — development Preview

Use **Preview**, sign in with the existing advisor email/password, then choose **Clients** and open a fictional test client. This phase does not activate Hostinger, change DNS, publish the homepage, or send a real client report.

The finished workspace is intended to connect these tools:

- **Recommendations:** generate proposals from a saved analysis. Inspect client-specific evidence and missing-input limitations. Edit, approve, remove, or add a custom action. Editing clears approval. Recalculation makes old approvals stale. Only current approved actions enter a new report.
- **Scenarios:** duplicate the base plan, change validated inputs, calculate the alternatives, and select no more than three for comparison. Alternatives do not alter the submitted profile or previous reports. Hypothetical annuity payout assumptions are illustrations, not product quotes or guarantees.
- **Notes & tasks:** keep timestamped private notes and follow-ups with due dates and owners; complete or reopen a task. Concurrent edits must reload instead of overwriting.
- **Narrative:** review an editable letter and section explanations. Template mode works without an AI provider. Numeric guardrails reject unsupported figures. Edits or new analyses clear approval. Optional AI requires separate runtime configuration and approval to share minimized data.
- **Reports:** select a saved scenario, optionally include a comparison and educational LSRT-help wording. Only matching approved actions/narrative are snapshotted. Downloaded PDFs remain private and immutable; no automatic report email occurs.
- **Annual review:** after presenting a ready report, explicitly record presentation and the next review date. A later scheduler queues one advisor reminder thirty days before the date. Queueing an update request prepares a private, seven-day link prefilled with prior answers; renewed consent and a revision check protect submission. An annual update changes the existing client, never creates a duplicate or rewrites an old report.
- **Settings → Email templates:** edit future annual-update and reminder wording. Secure-link expiry/forwarding safeguards cannot be removed. Saved templates do not rewrite queued email payloads.

## Production stays separate

Reminder scheduling and email transmission remain held until the signed production dispatcher, verified LSRT mailbox and deployment protections are activated on the existing KVM 2. A pending queue entry is not proof of delivery. No live hosting changes are part of this advisor-feature build.

### Approval and display safeguards

Changing, approving or removing a recommendation clears any related approved narrative; review that narrative again before including it in a new PDF. Previously generated PDFs stay unchanged. The Clients table shows real saved readiness/simulation metrics only when the input revision, assumption/engine versions and planning date are still current; “Recalculate” means the saved analysis is stale, not a zero score. All real lifecycle statuses can be filtered.

Long approved content and an optional comparison can extend the baseline 22-page report. Every approved action and next step is preserved rather than clipped. Optional AI and actual outbound mail remain held; template narratives do not require an AI account.
