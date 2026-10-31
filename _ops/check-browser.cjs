const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const http = require('node:http');
const path = require('node:path');
const { chromium, webkit } = require('playwright');
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
  const regions = ['taranaki', 'whanganui', 'manawatu'];

  function describeRequest(req) {
    const url = new URL(req.url());
    const body = new URLSearchParams(req.postData() || '');
    return {
      isAjax: url.searchParams.get('isAjax') === '1',
      email: body.get('EMAIL'),
      locale: body.get('locale'),
      honeypot: body.get('email_address_check')
    };
  }

  function assertNative(entry) {
    assert.equal(entry.isAjax, false);
    assert.equal(entry.email, 'test@example.invalid');
    assert.equal(entry.locale, 'en');
    assert.equal(entry.honeypot, '');
  }

  try {
    async function runSignup(engine, engineName) {
      browser = await engine.launch({ headless: true });
      async function setup(region, handler) {
        const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
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
          const entry = describeRequest(req);
          assert.equal(entry.email, 'test@example.invalid');
          requests.push(entry);
          if (!entry.isAjax) {
            assertNative(entry);
            if (engineName === 'webkit') {
              await route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: '<!doctype html><title>intercepted</title><p>native post intercepted</p>' });
            } else {
              await route.fulfill({ status: 302, headers: { location: `${base}/${region}/thank-you.html` } });
            }
            return;
          }
          await handler(route, requests.length);
        });
        await page.goto(`${base}/${region}/`);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
        assert.equal((await page.locator('#signup').getAttribute('method')).toLowerCase(), 'post');
        assert.match(await page.locator('#signup').getAttribute('action'), /^https:\/\/37afba3a\.sibforms\.com\/serve\//);
        assert.match(await page.locator('script[src*="signup.js"]').getAttribute('src'), /signup\.js\?v=20261031$/);
        const names = await page.locator('#signup [name]').evaluateAll(els => els.map(el => el.getAttribute('name')).sort());
        assert.deepEqual(names, ['EMAIL', 'email_address_check', 'locale']);
        await page.locator('#email').fill('test@example.invalid');
        await page.locator('input[type=checkbox]').check();
        return { context, page, requests, jsErrors };
      }
      function waitForNativePost(page, region) {
        return page.waitForURL(url => {
          const value = url.toString();
          return value === `${base}/${region}/thank-you.html` || value.startsWith('https://37afba3a.sibforms.com/serve/');
        });
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
        ['redirect', route => engineName === 'webkit'
          ? route.abort('failed')
          : route.fulfill({ status: 302, headers: { location: base + '/taranaki/thank-you.html' } })],
        ['network failure', route => route.abort('failed')]
      ];
      for (const region of regions) {
        for (const [label, handler] of scenarios) {
          const { page, context, requests, jsErrors } = await setup(region, handler);
          try {
            await page.locator('button[type=submit]').click();
            if (label === 'explicit rejection') {
              await errorVisible(page);
              assert.equal(new URL(page.url()).pathname, `/${region}/`);
              assert.equal(requests.length, 1);
              assert.equal(requests[0].isAjax, true);
              assert.match(await page.locator('#form-error').innerText(), /Please check the address/);
              assert.doesNotMatch(await page.locator('#form-error').innerText(), /Check your inbox/);
            } else {
              await waitForNativePost(page, region);
              assert.equal(requests.filter(item => item.isAjax).length, 1);
              assert.equal(requests.filter(item => !item.isAjax).length, 1, engineName + ' ' + label + ' native fallback');
            }
            assert.deepEqual(jsErrors, []);
            checks++;
          } finally { await context.close(); }
        }
        {
          const { page, context, requests, jsErrors } = await setup(region, reply(200, '{"success":true}'));
          await page.locator('button[type=submit]').click();
          await page.waitForURL(`${base}/${region}/thank-you.html`);
          assert.equal(requests.length, 1);
          assert.equal(requests[0].isAjax, true);
          assert.deepEqual(jsErrors, []);
          await context.close(); checks++;
        }
        for (const noAbortController of [false, true]) {
          let release;
          const { page, context, requests } = await setup(region, async route => {
            await new Promise(resolve => { release = resolve; });
            await route.fulfill({ status: 200, contentType: 'application/json', body: '{"success":true}' }).catch(() => {});
          });
          try {
            if (noAbortController) await page.evaluate(() => { window.AbortController = undefined; });
            await page.clock.install();
            await page.locator('button[type=submit]').click();
            await page.waitForFunction(() => document.getElementById('signup').getAttribute('aria-busy') === 'true');
            await page.locator('#signup').evaluate(form => { form.dispatchEvent(new Event('submit', { cancelable: true })); });
            await page.waitForTimeout(50);
            assert.equal(requests.length, 1, 'duplicate submit must not send another request');
            await page.clock.runFor(15001);
            await waitForNativePost(page, region);
            assert.equal(requests.filter(item => item.isAjax).length, 1);
            assert.equal(requests.filter(item => !item.isAjax).length, 1, 'timeout must fall back once, not replay the ajax POST');
          } finally {
            if (release) release();
            await context.close();
          }
          checks++;
        }
        {
          const { page, context, requests } = await setup(region, reply(200, '{"success":true}'));
          await page.evaluate(() => {
            window.fetch = function () { return Promise.reject(new TypeError('Load failed')); };
          });
          await page.locator('button[type=submit]').click();
          await waitForNativePost(page, region);
          assert.equal(requests.length, 1, engineName + ' fetch failure must send one native POST');
          assert.equal(requests[0].isAjax, false);
          assertNative(requests[0]);
          await context.close(); checks++;
        }
        {
          const { page, context, requests } = await setup(region, reply(200, '{"success":true}'));
          await page.locator('input[type=checkbox]').uncheck();
          await page.locator('button[type=submit]').click();
          await page.waitForFunction(() => document.getElementById('form-error').textContent === 'Please tick the box to agree before signing up.');
          assert.equal(await page.evaluate(() => document.activeElement && document.activeElement.type === 'checkbox'), true);
          assert.equal(requests.length, 0);
          await page.locator('input[type=checkbox]').check();
          assert.equal(await page.locator('#form-error').innerText(), '');
          await page.locator('#email').fill('invalid');
          await page.locator('#signup').evaluate(form => form.dispatchEvent(new Event('submit', { cancelable: true })));
          assert.equal(requests.length, 0);
          await context.close(); checks++;
        }
      }
      await browser.close();
      browser = null;
      console.log(`PASS signup: ${engineName} at 390px`);
    }

    await runSignup(chromium, 'chromium');
    await runSignup(webkit, 'webkit');

    browser = await chromium.launch({ headless: true });
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
      await page.goto(`${base}/${region}/thank-you.html`);
      assert.match(await page.locator('h1').innerText(), /check your email/i);
      await page.goto(`${base}/${region}/confirmed.html`);
      assert.equal(await page.locator('h1').innerText(), "You're in!");
      assert.match(await page.locator('body').innerText(), /Thanks for confirming\. Your first .+ Funding email will arrive next Monday morning/);
      assert.equal(await page.locator('a.share').getAttribute('href'), `https://nzgrants.org/share/?r=${region}`);
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
    await page.goto(base + '/manawatu/');
    await page.screenshot({ path: path.join(root, '_qa-output', 'manawatu-phone.png'), fullPage: true });
    await context.close();
    console.log(`PASS: ${checks} browser scenarios; external requests intercepted, no live signup or email.`);
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(err => { console.error(err); process.exitCode = 1; });
