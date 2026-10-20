# Test intake submission

The final **Submit retirement intake** button stays disabled until you explicitly check the unchanged consent statement. The checkbox is beside the final submit button. It is never checked for you. The submit handler and server both continue to reject unchecked consent, and saving a draft does not create a dashboard client.

For the current test, a remaining Step 4 validation error was identified: **Essential monthly spending cannot exceed total retirement monthly spending.** Correct those fictional estimates so essential spending is less than or equal to total retirement spending. Do not change real planning answers merely to pass validation.

Refresh Preview at `/intake` to load the updated controls and your saved answers. Correct Step 4, continue to Step 8, review the answers, and check consent only if you agree. Click **Submit retirement intake** and wait for the thank-you confirmation. Then visit `/dashboard/clients` to see the submitted profile. No separate import is required.

The agent has not edited your financial answers, checked consent, or submitted the intake for you. The blue branding, live homepage and Hostinger deployment are unchanged. This remains a fictional-data test; real email delivery is not yet operational.
