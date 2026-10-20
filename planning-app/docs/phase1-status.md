# Phase 1 foundation status

## How Jesse logs in now

1. Refresh this task’s Preview and open **Advisor log in**.
2. Enter **agentjesse247@gmail.com** and the existing application password entered through protected input.
3. Click **Sign in** to open the dashboard. No authenticator app, QR scan, or six-digit code is required.

Jesse explicitly requested removal of authenticator verification on October 20, 2026. The password was not changed. Old enrollment secrets and setup challenges were invalidated; obsolete enrollment/verification endpoints return 410 and cannot create sessions. Password-only access is less secure than two-factor access: use a unique password, preferably 12+ characters, although the approved minimum remains 8.

## Implemented and verified

The existing RetirementExpert blue colors and typography are preserved. The application is separate from the untouched retirementexpert.si homepage and live GitHub main branch. The development advisor account is provisioned and assigned to incoming test intakes. No Hostinger hosting, domain or account changes were made; nothing was published or deployed.

The eight-step mobile intake, shared validation, revision-aware autosave, encrypted data/private PDFs, consent, scoped client records, password-only advisor login, reset, dashboard/list/edit/export, and contact/security settings are implemented. Password verification is real, passwords are hashed, cookies are HttpOnly/Secure, and rate limits, CSRF/strict-origin checks, advisor authorization and the 30-minute idle timeout remain active. The prior Preview proxy-origin login block is repaired with a development-only, exact-metadata exception; production still requires the exact public origin. No fake user or login bypass exists.

Current verification passed **39 unit/security tests** and **13 isolated end-to-end checks**. Those checks verify that an eight-character password creates a real secured session without MFA, wrong passwords are rejected, legacy MFA endpoints are closed, client submissions/editing work, resets revoke sessions, and idle/CSRF protections remain. Temporary fixtures were removed from the dedicated test database; no provider email was sent. Recorded migrations were applied only to isolated development/test, not Hostinger production.

## Still open

The authorized LSRT mail metadata request returned HTTP 403; sender verification and real delivery remain incomplete. Resume/reset/confirmation/alerts are honestly queued, not claimed sent, and a durable production dispatcher requires configuration. Use fictional intake information until the production privacy, storage, retention, backup and compliance gates are complete. Logo/report-branding settings and the later calculation/report/recommendation phases remain open in TODO.md.

The approved production destination is **plan.retirementexpert.si on Hostinger**, which is not deployed yet. Runtime/database/environment/domain setup and cutover remain separate approval gates. The FTP-only constraint has not been resolved for the Node.js application and must not be silently replaced. GitHub’s isolated platform branch is source storage, not deployment. No purchases, upgrades, homepage replacement, real-client data or report delivery is authorized.
