# RetirementExpert public connection — October 21, 2026

## Sign in

Open **https://plan.retirementexpert.si/login**, or visit **https://retirementexpert.si/** and choose **Advisor log in**. Use **agentjesse247@gmail.com** and the same existing advisor password. No authenticator or new password is required. The owner account was provisioned using the existing verified password hash; the password was not exposed or changed.

## Connected and verified

Only the planning subdomain A record was added, pointing to the existing Hostinger KVM 2. Root, www and ftp DNS remain unchanged. HTTPS uses a separate free certificate valid through January 19, 2027, with certificate renewal and a scoped nginx reload hook. The portal runs as a non-root service at 127.0.0.1:3117 behind its own nginx host. Other websites and server applications remain intact.

The regular website now has four direct advisor/workspace links rather than buttons intercepted by the coming-soon modal. Only index.html was uploaded. All original blue style/asset references, SVG graphics and page structure remain unchanged; a private pre-change rollback copy is retained. The homepage CDN cache was purged after the upload. The legacy portal /platform route redirects to /login.

TypeScript and 25 focused public-page/authentication/production-hold regressions passed. The actual Hostinger route build passed. Ten public endpoint checks passed: HTTPS login shell, visibly closed intake without a form, legacy redirect, anonymous client-data denial, private scheduler endpoint denial, correct-origin password validation, cross-site/forged-header rejection, production-draft rejection, HTTP-to-HTTPS redirect and valid page manifest. An isolated browser confirmed the login form hydrates with email/password fields and no authenticator; no credentials were entered.

## What is not activated

**Real-client intake remains closed.** Public /intake shows availability information before any questionnaire, personal-data entry or autosave runs. The signed scheduler endpoint is not reachable from the public proxy. Existing session security, secure cookies, CSRF and rate limits remain in force. Forwarded address/host/protocol headers are overwritten rather than trusting caller-supplied values, and nginx does not log sensitive request URLs.

**Email is not operational.** The earlier approved one-message test returned HTTP 403 and was not confirmed sent. No additional email was attempted and the outbox was not released. All configured destinations remain restricted to brokerjesse247@gmail.com.

Encrypted off-host backup/key recovery, owner-approved retention/legal holds, compliance approval and real-client launch verification are still pending. Public advisor access is not approval to change those flags. Preview clients, private documents, sessions and queued messages were not imported; the public planning database starts with zero clients.

## Source and temporary access

Connection code and the minimally updated homepage source are saved on retirementexpert/platform, not mysscoach or the live homepage main branch. Manus development checkpoints remain separate; no Manus publication was requested. A focused read-only review found no confirmed privacy, origin or proxy-boundary defect. Exactly one temporary task-specific root key was removed after setup; six pre-existing authorized-key lines were preserved and a subsequent test confirmed this task's key no longer authenticates. Temporary homepage-upload credentials were deleted. Private server rollback copies remain protected and no unrelated service was restarted or reconfigured.
