# NZ Grants operations

Canonical website: https://github.com/Woodyhere1991/taranaki-funding, branch `main`.
GitHub Pages publishes `main:/` to https://nzgrants.org. Old Cursor branches are historical, not the deployment source. The local checkout is `C:\Users\nakiw\OneDrive\Desktop\Money Machine\nzgrants`.

## What lives where

- Regional `index.html`: signup content and the existing public Brevo form endpoint. Preserve the endpoint-to-region mapping.
- `signup.js`: shared submission handling for all three regions. Accept only HTTP success with JSON `success: true`. Timeout includes the response body; never retry a POST automatically. Uncertain outcomes ask the subscriber to check their inbox first.
- Regional `sample.html`: canonical published issue content. Keep these updated rather than creating separate editable website/email copies.
- `_ops/grant-register.json`: source, date and eligibility verification record. Recheck before each issue. A verified date does not mean every applicant is eligible.
- Brevo: subscriber consent/confirmation, regional lists, suppression, campaign drafts, sender authentication, sending and reporting. None of that is established by a GitHub Pages deployment.

## Weekly process

1. Work from current `main`; recheck the funders in the register once per issue, recording changes and contradictions. Ask the funder when dates conflict; do not invent a resolution.
2. Update each regional sample, then run `node _ops/prepare-campaigns.mjs`. This creates ignored local `_campaign-build/taranaki.html`, `whanganui.html` and `manawatu.html` from the samples. It only writes local files.
3. Import the generated HTML into the intended Brevo draft after confirming the account and campaign. It contains Brevo's documented `{{ unsubscribe }}` hyperlink. Public samples instead have a working mailto unsubscribe request, clearly described as manually handled. Never paste the public sample directly into a campaign.
4. Review the complete final draft and intended regional audience with the owner; obtain explicit send/schedule approval. Do not send, schedule, replace an already scheduled campaign or resume Grok routines as part of a website release.
5. Check Brevo's saved campaign ID, status, final content, confirmed regional recipient count (exclude suppressed/unconfirmed contacts), sender authentication, working rendered unsubscribe URL and exact Auckland send time. For this first issue, Monday is 19 October 2026 (NZDT, UTC+13). Record the actual saved receipt; a prepared draft is not a scheduled campaign.
6. After sending, record aggregate delivered/bounced/unsubscribed/click counts. Provider acceptance is not delivery; open counts alone are not reliable readership. Keep subscriber emails and account receipts out of this public repository.

Keep Grok's paused routines paused. Use a single weekly verification/drafting pass instead of repeated background reviews. No new tracking or recurring jobs were enabled by these repairs.

## Brevo verification (17 October 2026)

The owner signed in to the newsletter account `nzfundinglist@gmail.com` in Chrome. The separate default Google sign-in account does not contain these newsletter forms or campaigns; confirm the account identity before editing. No credentials are stored in this checkout.

All three existing forms use double confirmation and their matching regional lists: Taranaki list #4, Whanganui #5, Manawatu #6. Confirmation templates #5/#6/#7 contain the correct regional names, sender, subject and `{{ doubleoptin }}` link even though #6/#7 have old internal copy names. Submission and validation redirects point to each region's thank-you page. `nzgrants.org` is authenticated; the three `news@nzgrants.org` senders are verified and show configured DMARC. Account time zone is Auckland.

The account had no newsletter campaigns before this repair. Prepared and saved three **unsent, unscheduled owner-review drafts** from the corrected source: [Taranaki #8](https://app.brevo.com/marketing-campaign/edit/8), [Whanganui #9](https://app.brevo.com/marketing-campaign/edit/9) and [Manawatu #10](https://app.brevo.com/marketing-campaign/edit/10). The saved regional audiences were 7, 3 and 1 recipients respectively; recheck at scheduling time. Each uses its own regional sender and list, a `{{ unsubscribe }}` hyperlink, and `nzfundinglist@gmail.com` as the Reply-to address for manual unsubscribe requests. Do not create duplicates if these draft IDs already exist.

The original Manawatu issue was referenced in Grok's remote workspace but its text was not present in GitHub, Brevo or the locally saved chat. The replacement `manawatu/sample.html` was rebuilt from current primary funder sources, with venue and council boundaries checked. It is not a recovered copy of Grok's original.

The owner explicitly approved Monday-morning scheduling on 17 October. Final saved content, regional senders, recipient totals and unsubscribe placeholders were checked. Brevo now confirms all three campaigns as **Scheduled for Monday 19 October 2026 at 09:00 Pacific/Auckland (NZDT, UTC+13)**, equivalent to 18 October at 20:00 UTC: Taranaki #8 (7 recipients), Whanganui #9 (3), Manawatu #10 (1). These are one-off issue schedules, not recurring weekly campaigns. Do not create duplicates or edit a scheduled campaign without a new reason.

Still pending: actual delivery/bounce results after sending, and verification of the unsubscribe URL in a received email. The documented placeholder is present in every saved campaign; no test email was sent and no real contact was unsubscribed to exercise it. No test-signup, contact modification, confirmation-email trigger, authentication change or Grok routine restart was performed. Website tests mock every signup request. Aggregate local scheduling evidence is retained in the ignored `_qa-output` folder; subscriber details and account receipts stay out of the public site.

## Verification and publishing

With Node.js and Playwright available, run `node _ops/check-browser.cjs`. If Playwright is bundled outside the checkout, set `NODE_PATH` to its `node_modules` directory. Tests start a loopback-only server, block external traffic and use mocked Brevo responses. They cover all regions, success/error contracts, duplicate submits, timeout/late responses, retry context, consent validation, redirects, sharing and narrow screen overflow. These are browser tests, not a physical-phone or delivered-email certification.

Before pushing, run `node --check signup.js` and `git diff --check`. Review and commit only intended files. Check the remote branch has not advanced before a normal, non-force push. Then verify the Pages build commit and the live changed files. `_ops`, `_campaign-build` and `_qa-output` are excluded from the Pages site; generated files are git-ignored. No secrets or subscriber data belong in any of these public source files.

References: [Brevo signup configuration](https://help.brevo.com/hc/en-us/articles/208771869-Create-a-sign-up-form-in-Brevo), [Brevo unsubscribe placeholder](https://help.brevo.com/hc/en-us/articles/209553645-Insert-a-custom-unsubscribe-link-in-your-emails).
