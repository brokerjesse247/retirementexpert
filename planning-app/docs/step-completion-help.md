# Required-answer step locks

Each intake page now validates its own required and conditional answers independently. Blank future pages cannot suppress checks on the current page.

**Continue stays disabled** until the current step and all earlier steps are valid. Locked step tabs cannot skip incomplete answers. Enter-key navigation, review edit links, restored drafts and server-saved draft positions use the same no-skipping rule. Going backward to correct an answer is allowed; deleting a required answer locks later pages again.

Missing or invalid questions appear in a clickable summary and beside the question. Click a question in the summary to focus it. If married, spouse identity, earned income, Social Security PIA and retirement age must be supplied on their respective pages. Required income can be **0** when there is no earned income. Known asset allocation, existing Social Security benefits and LTC coverage trigger their relevant required answers. Genuinely optional questions remain optional. Consent is never checked automatically.

Partial answers still autosave. Saving is not submission: a dashboard client is created only after valid Step 8 submission succeeds. The agent has not filled answers or submitted the user’s intake.

Refresh Preview at `/intake` to load the update. Your saved answers remain available. The form opens no farther than the first incomplete step. To test a lock, leave a required question blank: Continue and later pages should be unavailable. Fill that question correctly and they unlock. Use fictional data during this development test.

The existing blue palette and live website are unchanged. No publication or Hostinger deployment was performed.
