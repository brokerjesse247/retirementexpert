# Hostinger setup status — October 20, 2026

Jesse’s authenticated My Browser access is confirmed. The existing retirementexpert.si Hostinger dashboard was inspected read-only. It is a PHP/HTML website linked to GitHub repository retirementexpert, branch main, root public_html. Current dashboard deployment is commit f26ca340, completed October 20. Existing auto-deployment was not changed and no code was pushed to live main.

The account has Business Web Hosting. RetirementExpert’s database page currently presents a create-database/user form; no planning database was created or configured during inspection. A Next.js/Chromium planning runtime is not shown as provisioned for plan.retirementexpert.si. FTP remains Jesse’s stated transfer preference, but uploading static files alone cannot run this server application. Runtime setup and a compatible transfer/start procedure must be resolved before domain activation.

Existing Hostinger website backups are configured Daily. The backups page reports latest backup October 20 at 18:39 and next daily backup October 21. Its notice says database export files, backup archives and cache are excluded. Those existing website backups do not prove that the new planning database, private reports, encryption keys or an off-host recovery copy are covered. No restore, backup creation or retention change was triggered.

The application now includes encrypted database backup and guarded restore tooling. A real encrypted MariaDB backup was restored to a separate local retireplan_restore_test database; tables and an isolated marker matched. This is development recovery evidence, not a production Hostinger restore drill.

The authorized LSRT Mail API token is not currently available in the environment; prior metadata evidence was HTTP 403. No inbox, messages or email contents were accessed, and no email was sent. Sender verification and actual dispatch remain blocked. A verified login to Hostinger is not the same as a configured mail API credential.

Production environment, database credentials, Chromium execution, scheduler/replay migration, mail sender verification, encrypted off-host backup destination, retention/legal-hold approval and compliance approval remain activation gates. The application’s final production-intake submission now fails closed until these launch protections are recorded. No purchases, DNS/domain bindings, SSH keys, account passwords, other websites or production homepage files were changed.

## October 21 activation inspection

Direct Hostinger access is now enabled and working. VPS 1782266 is the existing Ubuntu 24.04 KVM 2 at 2.25.68.235; no server change was made. API inspection showed two existing backups, dated October 8 and October 15, and the dashboard reports a weekly schedule. No backup was created/restored and no paid daily-backup upgrade was purchased. Those points do not verify recovery of the new encrypted planning database or an application-specific off-host copy.

The browser terminal reports an expired/invalid session. A new task-specific SSH key was generated locally, but adding it to the server requires Jesse’s pending approval; existing SSH keys were not changed. The Hostinger Mail API connection exists, but its token is empty/unusable in both the project and base execution environment. No metadata authentication success or sender attestation is claimed. Live dispatch and real-client intake remain closed. All portal mail is restricted in code to brokerjesse247@gmail.com, including legacy queued recipients, without changing advisor login.
