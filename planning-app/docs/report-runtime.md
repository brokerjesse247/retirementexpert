# Report renderer runtime

`lib/reports/render.ts` converts an immutable ReportRenderInput snapshot into self-contained Letter-portrait HTML and a private server-generated PDF.

## Interface and layout

`REPORT_SECTION_OPTIONS` provides selectable sections. Empty sections select the complete default 22-page report for the current no-approved-recommendations workflow. The cover remains in a shorter selected-section report. An empty action plan occupies one honest review page, not two blank recommendation pages. Full source citations and complete model-warning disclosures use separate appendix pages; repetitive annual warnings become explicit year-range summaries whose original warning associations are preserved. Each annual cash-flow shortfall retains its exact year and dollar amount in compact groups; repeated earnings-test omissions retain every affected year. No warning, dollar value or source key is silently removed.

`renderReportHtml(input)` is deterministic from its supplied snapshot and local fonts. It does not call a database or external API. `renderReportPdf(input)` uses server-only Chromium, blocks all network requests and embeds approved local fonts/logo data. It checks every page’s content against the fixed footer before producing PDF bytes. A crowded page throws REPORT_LAYOUT_OVERFLOW rather than delivering clipped content; the advisor must shorten an excessive letter/note or otherwise correct the layout before retrying.

Percentages use explicit fraction versus percentage-point units. For example, a 0.5 percentage-point Monte Carlo success result displays 0.5%, while an income-coverage ratio of 1.5 displays 150%. The renderer never derives financial values or recommendations from display heuristics.

## Production runtime gate

Development defaults to `/usr/bin/chromium`. Production requires a verified executable path in `CHROMIUM_EXECUTABLE_PATH`; without it, rendering fails with REPORT_PDF_RUNTIME_UNAVAILABLE. Merely building Next.js or uploading source does not install Chromium/system dependencies on Hostinger. PDF runtime must be verified in the actual application host before production use.

## Authorization and record boundaries

The parent report service verifies advisor ownership, revision, approved letter and complete saved lineage before rendering. It stores encrypted immutable report snapshots and encrypted PDF bytes with a SHA-256 checksum. Download requires the owning live advisor session and a ten-minute signed grant. Generating/downloading a report sends no email and does not mark it sent.

The renderer only formats supplied inputs/results and displays missing modules or partial inputs honestly. It includes only current, scenario-matched approved recommendation records. The advisor proposals module generates candidates separately and never auto-approves them. All interpolated client/advisor text, warnings, sources and recommendations are HTML-escaped. Dollar values use deterministic display rounding.

Every page, including the cover, contains the educational/illustrative disclaimer, advisor/date and exact Page X of Y footer. The final disclosure page includes the full tax/legal/insurance disclaimer and complete consolidated warnings. The preceding appendix contains source classifications, citation URLs, source keys, annual year and saved assumption/version lineage.

## Synthetic verification

`scripts/verify-report-layout.ts` runs the actual analysis with the default 5,000 simulations and seed 42 using fictional data, checks DOM overflow, emits the PDF, inspects page/footer/source/warning completeness and creates an ignored contact sheet under private-storage/report-review. No real client records are read or stored by this verification.

## Advisor additions

Selected scenario comparisons retain explicit units and unavailable values. Approved action plans include every action, next step, owner, target date and supplied impact; long actions use exact-text continuation cards rather than clipping. LSRT-help wording appears only after the report-builder opt-in. The baseline complete report is 22 pages; many approved actions, an optional comparison or long approved explanations can add pages. Correct content takes priority over truncating to a fixed page count.

Approved section explanations are placed alongside their matching result sections. If a combined page would reach the footer, Chromium moves the entire approved explanation to a labeled continuation page and updates all Page X of Y footers, then repeats the original fail-closed layout check. Immutable snapshot text is never discarded.
