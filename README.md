# RetirementExpert

A responsive, static one-page introduction for **https://retirementexpert.si/**. The visual design follows Jesse's reference with a near-black backdrop, vivid blue accents, large typography and luminous buttons.

## Hosting and automatic deployment

**GitHub is the source of truth. Hostinger hosts the live website.** Hostinger's native Git integration deploys `brokerjesse247/retirementexpert`, branch `main`, directly to the site's dedicated `public_html` directory. Automatic deployment is enabled and has been verified with a successful push-triggered deployment. There is no Manus publishing step and no Manus hosting, database, authentication or runtime dependency.

Commit changes to `main` in GitHub to update the website automatically. Direct edits in Hostinger File Manager may be overwritten by the next Git deployment, so make lasting changes in GitHub.

## Editing the site

`index.html` contains all page copy, sections and metadata. `assets/styles.css` owns styling and responsive breakpoints. `assets/app.js` handles the mobile navigation and development-status modal. `assets/brand.svg` is the favicon. No frontend framework, package installation or build dependency is required.

For local development, run `python3 -m http.server 3000` in this folder. Optional: run `bash scripts/build.sh` to prepare a standalone `dist/` archive. Hostinger's native Git deployment serves the repository directly; it does not require this build command.

## First-stage scope and expansion

This is the first page of a larger future website, not the Roth calculator itself. Accounts, billing, stored scenarios and report generation are planned, not implemented. All workspace buttons disclose that status. There are no lead forms or personal-data submissions. The headline is brand positioning, not a promise of sales or financial results. Do not add unsupported user counts, testimonials or performance claims.

Page content, styling and interactions are separate so additional pages and functionality can be added. A future backend or calculator must be deliberately implemented and validated rather than implied to exist today.

## Security

Never commit credentials or `.env` files. `.htaccess` blocks source documentation, build scripts, configuration and version-control data from public HTTP access. Deployment changes must be scoped to retirementexpert.si, preserving other websites and unrelated DNS settings.
