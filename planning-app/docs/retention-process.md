# Proposed retention and legal-hold process

> **Status: pending owner approval.** This is proposed operational text, not a legal conclusion, regulatory guarantee, or activation of a production retention/deletion policy. No automated permanent deletion is implemented by this process.

## Proposed operating policy

Subject to explicit owner approval and any applicable professional advice, LSRT proposes to operate as follows:

- Keep **final reports, recorded consents, and analysis inputs** for a minimum of **six years**. A generated report has its own immutable `Report.retainUntil` date; a legal-hold action must not alter that date.
- A **legal hold blocks deletion or expiration work** for the held client until the advisor explicitly releases the hold following review.
- Keep **unsubmitted intake drafts for 30 days** under the proposed draft-retention process.
- Keep **rolling encrypted backups for 30 days** under the proposed backup process.
- Perform **no automatic permanent deletion**. Any future disposition requires owner review, an auditable operational action, and the approved policy/process at that time.

This proposal does **not** claim that a law requires a six-year period. The owner must approve the policy, off-host backup destination, key custody, restore process, and any retention/deletion implementation before real-client operation is enabled.

## Advisor legal-hold workflow

1. Open the client’s dedicated retention workspace. The action is available for an owned client, including an archived client, so archiving cannot create a data-loss path.
2. Select the explicit action: **Place legal hold** or **Release legal hold**. A boolean toggle is not used as a substitute for an explicit release decision.
3. Enter a non-empty operational reason of at most 500 characters. The release UI requires a separate confirmation that the advisor is explicitly releasing the hold and that no record will be deleted.
4. Submit with the client’s current revision. A stale revision returns a conflict instead of overwriting a newer client state; reload and review before retrying.
5. The system changes only `Client.retentionHold` and increments the client revision. It deliberately does not alter reports, report snapshots, PDFs, consents, uploads, drafts, or any `Report.retainUntil` value.
6. The reason and action history are placed in the existing encrypted advisor settings record under `retention-<client-id>`. The matching `AuditLog` entry uses a code-only summary (`RETENTION_HOLD_PLACED` or `RETENTION_HOLD_RELEASED`) and never copies the private reason.

## Access and data boundaries

- The retention API requires a live advisor session; writes additionally require the configured trusted origin and that session’s CSRF token.
- Every client and report query is scoped to the authenticated advisor’s ownership. Another advisor receives no retention metadata for a client they do not own.
- The retention GET response contains only the client hold state/revision and aggregate immutable report-retention dates/count. It does not return intake answers, report content, private reasons, uploaded documents, PDFs, or other client data.
- There is intentionally **no deletion, purge, export, or retention-date editing endpoint** in this feature.

## Production gates still owned elsewhere

This interface is an operational control, not evidence that retention or privacy approval is complete. Real-client intake, mail dispatch, policy approval, off-host encrypted backup, backup key custody, and recovery/restore evidence remain separately gated. The owner-only mail-routing rule remains in effect; this document does not authorize delivery of client resume or report emails.

Shared encrypted hold reasons and report branding use exact compare-and-swap updates. Conflicting edits return 409 and the whole transaction rolls back; private reasons are not report branding. Policy approval and off-host recovery remain pending.
