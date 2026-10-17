# taranaki-funding

Free weekly community funding deadline emails for Taranaki, Whanganui and Manawatū.

Live site: https://nzgrants.org

Region pages:

- https://nzgrants.org/taranaki/
- https://nzgrants.org/whanganui/
- https://nzgrants.org/manawatu/
- https://nzgrants.org/share/?r=<region> (`taranaki`, `whanganui`, or `manawatu`)

The root `index.html`, `thank-you.html` and `sample.html` redirect stubs must stay permanently, because invites already sent link to the old root.

Custom domain served over HTTPS (Enforce HTTPS on).

All three signup pages share `signup.js`. See [_ops/README.md](_ops/README.md) for source checks, offline campaign preparation, tests and the Brevo account checks still required before sending. A website deployment does not schedule a newsletter.
