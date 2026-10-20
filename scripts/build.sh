#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p dist/assets
cp index.html .htaccess robots.txt sitemap.xml dist/
cp assets/styles.css assets/app.js assets/brand.svg dist/assets/
printf 'Static website built in dist/\n'
