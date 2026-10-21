# Isolated Hostinger native runtime

The existing KVM 2 already provides Node 22, MySQL 8 and nginx/PM2 applications. RetirementExpert does not require Docker, a server reinstall or replacement of those applications. Its locked dependencies and additive migrations are prepared separately.

The application uses a dedicated `retireplan` system identity and DML-only MySQL login. Migration access is a separate identity scoped only to the new planning database. A third identity is scoped only to the separate recovery test database. Private runtime keys are generated directly on the VPS, stored outside the source tree and never printed or committed.

Native templates in `deploy/native/` define:

- `retireplan-app.service`: the non-root Next.js runtime, **loopback only on 127.0.0.1:3117**; no public listener or nginx/DNS change.
- `retireplan-dispatch.service` and `.timer`: one signed queue request per minute after the previous request finishes. The request uses a fresh HMAC-signed nonce and a fixed loopback endpoint, forbids redirects and prints only HTTP status. It cannot bypass the existing database replay store or outgoing-email approval hold.
- `retireplan-backup.service` and `.timer`: a daily 03:00 UTC encrypted-backup schedule. It is installed but must remain disabled until actual backup retention, destination, key custody and off-host recovery are approved.

Application files are root-owned/readable to the service group; only private cache/state locations are writable. Systemd uses a restrictive umask, no-new-privileges, private temporary space and a read-only system filesystem. Browser binaries use the isolated Playwright cache, not another application's files.

The Mail API token is stored as the root-owned encrypted systemd credential `/etc/credstore.encrypted/retireplan-mail-token`, not in the source tree or plaintext `runtime.env`. The app unit uses `LoadCredentialEncrypted=hostinger-mail-api:...`; `deploy/native/start-app.sh` exports the decrypted per-service credential only into the non-root app process. This unit requires the encrypted credential to be installed before startup. No token is logged or passed in command-line arguments. A host-bound systemd credential cannot be recovered on another server from its encrypted file alone: reissue the Mail API token or approve a separate secure credential-key recovery procedure. Do not falsely label a database-only restore as credential recovery.

The approved all-email destination is brokerjesse247@gmail.com. No old development outbox is migrated or released. Client data and advisor-account migration are separate from the empty schema setup. Real intake and live mail remain held; a loopback app build is not a public launch or an approved compliance/retention policy.

The new source and service definitions, runtime configuration/key custody, encrypted database/report/upload records, and scheduler definitions all require a private recovery plan. A database-only dump or the existing weekly VPS backup is not a complete off-host recovery claim. Only this task-specific SSH key should be removed after setup; existing keys and deployment services must remain intact.
