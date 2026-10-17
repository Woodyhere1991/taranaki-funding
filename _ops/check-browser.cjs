const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const http = require('node:http');
const path = require('node:path');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');

(async () => {
  const server = http.createServer(async (req, res) => {
    try {
      assert.equal(req.method, 'GET');
      let name = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
      if (name.endsWith('/')) name += 'index.html';
      const file = path.resolve(root, '.' + name);
      assert.ok(file.startsWith(root + path.sep));
      const body = await fs.readFile(file);
      res.setHeader('Content-Type', file.endsWith('.js') ? 'text/javascript' : file.endsWith('.html') ? 'text/html; charset=utf-8' : 'application/octet-stream');
      res.end(body);
    } catch { res.statusCode = 404; res.end('Not found'); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  let browser;
  let checks = 0;
  try {
    browser = await chromium.launch({ headless: true });
    const regions = ['taranaki', 'whanganui', 'manawatu'];
    async function setup(region, handler, options = {}) {
      const context = await browser.newContext({ viewport: { width: 375, height: 812 }, ...options });
      const page = await context.newPage();
      const requests = [];
      const jsErrors = [];
      page.on('pageerror', err => jsErrors.push(err.message));
      await context.route('**/*', async route => {
        const req = route.request();
        if (req.url().startsWith(base + '/')) return route.continue();
        // Every external request is intercepted. Never create a production signup.
        assert.match(req.url(), /^https:\/\/37afba3a\.sibforms\.com\/serve\//);
        assert.equal(req.method(), 'POST');
        assert.equal(new URL(req.url()).searchParams.get('isAjax'), '1');
        assert.equal(new URLSearchParams(req.postData()).get('EMAIL'), 'test@example.invalid');
        requests.push(req);
        await handler(route, requests.length);
      });
      await page.goto(`${base}/${region}/`);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      await page.locator('#email').fill('test@example.invalid');
      await page.locator('input[type=checkbox]').check();
      return { context, page, requests, jsErrors };
    }
    async function errorVisible(page) {
      await page.waitForFunction(() => document.getElementById('form-error').textContent.length > 0);
      assert.equal(await page.locator('button[type=submit]').isEnabled(), true);
      assert.equal(await page.locator('#email').inputValue(), 'test@example.invalid');
      assert.equal(await page.locator('input[type=checkbox]').isChecked(), true);
      assert.equal(await page.locator('#signup').getAttribute('aria-busy'), null);
    }
    const reply = (status, body, type = 'application/json') => route => route.fulfill({ status, contentType: type, body });
    const scenarios = [
      ['HTML success page', reply(200, '<html>Not accepted</html>', 'text/html')],
      ['malformed JSON', reply(200, '{')],
      ['missing success', reply(200, '{"message":"ok"}')],
      ['truthy string success', reply(200, '{"success":"true"}')],
      ['HTTP failure claiming success', reply(500, '{"success":true}')],
      ['explicit rejection', reply(200, '{"success":false,"errors":{"EMAIL":["Please check the address."]}}')],
      ['redirect', route => route.fulfill({ status: 302, headers: { location: base + '/taranaki/thank-you.html' } })],
      ['network failure', route => route.abort('failed')]
    ];
    for (const region of regions) {
      for (const [label, handler] of scenarios) {
        const { page, context, requests, jsErrors } = await setup(region, handler);
        try {
          await page.locator('button[type=submit]').click();
          await errorVisible(page);
          assert.equal(new URL(page.url()).pathname, `/${region}/`);
          assert.equal(requests.length, 1);
          assert.deepEqual(jsErrors, []);
          if (label === 'explicit rejection') assert.match(await page.locator('#form-error').innerText(), /Please check the address/);
          checks++;
        } finally { await context.close(); }
      }
      // Only an explicit acknowledgement reaches this region's thank-you page.
      {
        const { page, context, requests, jsErrors } = await setup(region, reply(200, '{"success":true}'));
        await page.locator('button[type=submit]').click();
        await page.waitForURL(`${base}/${region}/thank-you.html`);
        assert.equal(requests.length, 1);
        assert.deepEqual(jsErrors, []);
        await context.close(); checks++;
      }
      // Timeout covers stalled reads; a late old response cannot overwrite a retry.
      for (const noAbortController of [false, true]) {
        let release;
        const { page, context, requests } = await setup(region, async (route, count) => {
          if (count === 1) await new Promise(resolve => { release = async () => { await route.fulfill({ status: 200, contentType: 'application/json', body: '{"success":true}' }).catch(() => {}); resolve(); }; });
          else await reply(200, '{"success":false,"errors":"Try another time."}')(route);
        });
        if (noAbortController) await page.evaluate(() => { window.AbortController = undefined; });
        await page.clock.install();
        await page.locator('button[type=submit]').click();
        await page.waitForFunction(() => document.getElementById('signup').getAttribute('aria-busy') === 'true');
        await page.locator('#signup').evaluate(form => { form.dispatchEvent(new Event('submit', { cancelable: true })); });
        await page.waitForTimeout(50);
        assert.equal(requests.length, 1, 'duplicate submit must not send another request');
        await page.clock.runFor(15001);
        await errorVisible(page);
        assert.match(await page.locator('#form-error').innerText(), /Check your inbox/);
        assert.equal(requests.length, 1, 'timeout must not replay the POST');
        await page.locator('button[type=submit]').click();
        await page.waitForFunction(() => document.getElementById('form-error').textContent === 'Try another time.');
        assert.equal(requests.length, 2);
        await release();
        await page.waitForTimeout(50);
        assert.equal(new URL(page.url()).pathname, `/${region}/`);
        assert.equal(await page.locator('#form-error').innerText(), 'Try another time.');
        await context.close(); checks++;
      }
      {
        const { page, context, requests } = await setup(region, reply(200, '{"success":true}'));
        await page.evaluate(() => {
          window.fetch = async () => ({ ok: true, redirected: false, text: () => new Promise(() => {}) });
        });
        await page.clock.install();
        await page.locator('button[type=submit]').click();
        await page.clock.runFor(15001);
        await errorVisible(page);
        assert.match(await page.locator('#form-error').innerText(), /Check your inbox/);
        assert.equal(requests.length, 0);
        await context.close(); checks++;
      }
      {
        const { page, context, requests } = await setup(region, reply(200, '{"success":true}'));
        await page.locator('input[type=checkbox]').uncheck();
        await page.locator('#signup').evaluate(form => form.dispatchEvent(new Event('submit', { cancelable: true })));
        assert.equal(requests.length, 0);
        await page.locator('input[type=checkbox]').check();
        await page.locator('#email').fill('invalid');
        await page.locator('#signup').evaluate(form => form.dispatchEvent(new Event('submit', { cancelable: true })));
        assert.equal(requests.length, 0);
        await context.close(); checks++;
      }
    }
    const context = await browser.newContext({ viewport: { width: 320, height: 720 } });
    await context.route('**/*', route => route.request().url().startsWith(base + '/') ? route.continue() : route.abort());
    const page = await context.newPage();
    for (const region of regions) {
      await page.goto(`${base}/share/?r=${region}`);
      assert.equal(await page.locator('#share-url').inputValue(), `https://nzgrants.org/${region}/`);
      assert.equal(await page.locator('#signup').getAttribute('href'), `https://nzgrants.org/${region}/`);
      assert.ok((await page.locator('#email').getAttribute('href')).includes(encodeURIComponent(`https://nzgrants.org/${region}/`)));
      assert.ok((await page.locator('#facebook').getAttribute('href')).includes(encodeURIComponent(`https://nzgrants.org/${region}/`)));
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      checks++;
    }
    for (const region of regions) {
      await page.goto(`${base}/${region}/sample.html`);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      assert.match(await page.locator('[data-unsubscribe-request]').getAttribute('href'), /^mailto:nzfundinglist@gmail.com\?subject=UNSUBSCRIBE/);
      assert.equal(await page.getByRole('heading', { name: 'Tip of the week' }).count(), 1);
      checks++;
    }
    for (const [oldPath, target] of [['/', '/taranaki/'], ['/sample.html', '/taranaki/sample.html'], ['/thank-you.html', '/taranaki/thank-you.html']]) {
      await page.goto(base + oldPath + '?source=old#keep');
      await page.waitForURL(base + target + '?source=old#keep'); checks++;
    }
    await fs.mkdir(path.join(root, '_qa-output'), { recursive: true });
    await page.goto(base + '/manawatu/sample.html');
    await page.screenshot({ path: path.join(root, '_qa-output', 'manawatu-mobile.png'), fullPage: true });
    await context.close();
    console.log(`PASS: ${checks} browser scenarios; external requests intercepted, no live signup or email.`);
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(err => { console.error(err); process.exitCode = 1; });
