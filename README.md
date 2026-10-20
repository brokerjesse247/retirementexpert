# RetirementExpert

A responsive, static one-page introduction for **https://retirementexpert.si/**. The visual design follows Jesse's reference with a near-black backdrop, vivid blue accents, large typography and luminous buttons.

## Editing the site

`index.html` contains all page copy, sections and metadata. `assets/styles.css` owns styling and responsive breakpoints. `assets/app.js` handles the mobile navigation and development-status modal. `assets/brand.svg` is the favicon. No frontend framework, package installation or build dependency is required.

Run `python3 -m http.server 3000 --bind 0.0.0.0` in this folder for local development. Run `bash scripts/build.sh` to prepare the publishable `dist/` folder.

## First-stage scope

This is a landing page, not the Roth calculator itself. Accounts, billing, stored scenarios and report generation are planned, not implemented. All workspace buttons disclose that status. There are no lead forms or personal-data submissions. The headline is brand positioning, not a promise of sales or financial results. Do not add unsupported user counts, testimonials or performance claims.

## Hostinger

Deploy only to the Hostinger hosting directory assigned to retirementexpert.si. The intended Git connection deploys this repository's `main` branch to that site's web root, with automatic deployment enabled. `.htaccess` blocks source documentation, build scripts, configuration and version-control data from public HTTP access. No DNS or other websites should be changed without specific authorization.

The source is deliberately plain HTML/CSS/JavaScript so it can be edited through GitHub or Hostinger File Manager. With Git auto-deployment, GitHub is the source of truth: commit ongoing changes there, because a later deployment may overwrite direct File Manager edits.

## Security and future expansion

Never commit credentials or `.env` files. Hosting access must use the existing authenticated account or a dedicated scoped deployment credential. Add financial projections, authentication and persistence as separately validated features rather than implying that they already exist.
