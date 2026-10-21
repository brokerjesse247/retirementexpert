# Hostinger runtime status — October 21, 2026

## Verified on the existing KVM 2

The isolated RetirementExpert application uses its own pinned pnpm 10.18.0, locked dependencies, separate planning database and non-root retireplan service. All additive migrations and the actual Hostinger production build passed. The existing server was not reset or reinstalled, and unrelated applications, PM2, PHP, database services and nginx hosts were preserved.

The application listener remains **127.0.0.1:3117 only**. The newly authorized public host **https://plan.retirementexpert.si** proxies to that listener through its own nginx configuration and TLS certificate. Root/www/ftp DNS are unchanged. The current retirementexpert.si homepage offers direct Advisor log in links and preserves the existing blue styles and graphics. Source files are root-owned with service-group read access; private state/cache paths are writable only where required. Runtime encryption and signing keys were never printed or committed.

Jesse’s public advisor account was provisioned with only the existing verified password hash, name and email. The password is unchanged. Preview clients, documents, sessions and old queued emails were not copied; the public database has zero clients. Login is available at **https://plan.retirementexpert.si/login** using **agentjesse247@gmail.com**. Anonymous client APIs remain protected. Public intake now clearly shows collection closed rather than displaying an unusable form; its server writes remain blocked.

Chromium generated a valid synthetic Letter PDF as the non-root runtime user. The systemd queue service completed a signed request successfully and its durable timer is active, but outbound dispatch remains held. The Mail API token is an encrypted systemd credential and metadata was verified for the authorized LSRT mailbox. The approved send test returned HTTP 403; no delivery was confirmed and no automatic resend or queue release occurred.

The daily encrypted backup timer is installed but disabled pending retention, key-custody and private off-host destination approval. A real AES-256-GCM backup authenticated and restored into a separate test database; all 31 schema tables matched with zero clients in source and target at the time of that drill. Encryption round-tripped successfully. This is not proof of off-host recovery, and approval flags were not inferred from the local test.

## Remaining launch work

Email delivery, encrypted off-host recovery, key custody, retention/legal holds, real-client compliance approval and a real-client launch verification are pending. Public advisor access does not remove these holds. All email destinations remain brokerjesse247@gmail.com. Optional AI-provider use is still disabled.

The connection passed the actual Hostinger route build, 25 focused regressions and ten public endpoint checks. The broader earlier native suite passed 250 tests across 49 files. Connection-specific evidence and login instructions are in docs/public-access-status.md. Temporary root access is scoped to this task and is removed after setup; no broad Hostinger key-removal operation is used.
