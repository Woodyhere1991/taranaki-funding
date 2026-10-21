/*
Newsletter campaigns are built only on the operator's box with /workspace/funding-test/scripts/create_campaign.py, from the QA-passed issue files. The website sample.html pages must never be used to build Brevo campaigns. That is how campaigns #8 to #10 ended up with the old template and a Four Winds entry.

This file builds campaign HTML from regional sample.html pages. It must not be used for that.
*/
// Offline preparation only: no account access, sending or scheduling.
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = resolve(root, '_campaign-build');
await mkdir(output, { recursive: true });
for (const region of ['taranaki', 'whanganui', 'manawatu']) {
  const sample = await readFile(resolve(root, region, 'sample.html'), 'utf8');
  const request = /This is a public sample\. To stop receiving emails, <a data-unsubscribe-request href="[^"]+">email an unsubscribe request<\/a> from your subscribed address, or reply UNSUBSCRIBE to a newsletter\. Requests are handled by us\./g;
  if ([...sample.matchAll(request)].length !== 1) throw new Error(`${region}: expected one sample unsubscribe request`);
  const email = sample.replace(request, '<a href="{{ unsubscribe }}">Unsubscribe</a> at any time, or reply UNSUBSCRIBE to this newsletter.');
  await writeFile(resolve(output, `${region}.html`), email, 'utf8');
  console.log(`Prepared ${region} HTML with Brevo unsubscribe placeholder; not uploaded or sent.`);
}
