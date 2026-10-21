# Existing VPS inspection — October 21, 2026

Jesse approved the exact task-specific SSH key at 09:18. The Hostinger add-key API retained the pre-existing SSH key, and SSH authenticated successfully to VPS 1782266 at 2.25.68.235. The host is Ubuntu 24.04, with approximately 8 GB memory and 88 GB free disk at inspection. Existing MySQL, nginx, PHP, PM2 and Node application services are active. No existing service was stopped, restarted, replaced or reconfigured.

MySQL listens on loopback. Existing HTTP/HTTPS listeners are nginx; existing application listeners must be preserved. Node and pnpm are already installed. Docker is not installed and is not required for a separate native systemd runtime. No Chromium cache was found in the inspected locations. The root process environment did not contain a usable Mail API token; other applications’ credentials were not read or reused.

The approved public key is named retireplan-activation-20261021. Only this task-specific key will be removed once server setup is finished; no blanket key-removal API may be used because it could remove existing access. Host-key trust was pinned locally after connecting to the IP confirmed by Hostinger.

The planned preparation is a separate service user, separate database and loopback-only staging listener, without modifying nginx, DNS, homepage content or existing deployment services. Real intake, actual email dispatch and owner/legal/compliance attestations remain closed until independently verified.

Evidence sources: authenticated Hostinger `vps_virtual-machines_get`, `vps_ssh-keys_add-virtual-machine`, and read-only SSH identity/listener/service metadata on October 21. The two existing weekly VPS backups were verified through `vps_backups_list`; they are not proof of a new planning-database recovery copy.
