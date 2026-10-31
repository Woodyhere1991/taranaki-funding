(function () {
  'use strict';

  var form = document.getElementById('signup');
  if (!form) return;
  var button = form.querySelector('button[type="submit"]');
  var errorEl = document.getElementById('form-error');
  var emailInput = form.querySelector('input[name="EMAIL"]');
  var consent = form.querySelector('input[type="checkbox"]');
  var readyLabel = button.textContent;
  var pending = false;
  var consentText = 'Please tick the box to agree before signing up.';
  var failText = 'Your signup was not accepted. Please try again, or email nzfundinglist@gmail.com for help.';
  var transportText = "Sorry, your signup didn't go through. Please try again, or open nzgrants.org in Safari or Chrome. If it still fails, email nzfundinglist@gmail.com.";

  function brevoMessage(data) {
    var errors = data && data.errors;
    if (typeof errors === 'string') return errors;
    if (!errors || typeof errors !== 'object') return '';
    var parts = [];
    Object.keys(errors).forEach(function (key) {
      var value = errors[key];
      if (typeof value === 'string' && value) parts.push(value);
      else if (Array.isArray(value)) {
        value.forEach(function (item) {
          if (typeof item === 'string' && item) parts.push(item);
        });
      }
    });
    return parts.join(' ');
  }

  function showError(message) {
    pending = false;
    button.disabled = false;
    button.textContent = readyLabel;
    form.removeAttribute('aria-busy');
    errorEl.textContent = message;
  }

  // HTMLFormElement.submit() does not fire submit, so the fetch handler cannot run again.
  function nativeSubmit() {
    if (form.getAttribute('data-native-submit') === '1') return;
    if (!form.action || String(form.method).toLowerCase() !== 'post') {
      showError(transportText);
      return;
    }
    form.setAttribute('data-native-submit', '1');
    button.disabled = true;
    form.setAttribute('aria-busy', 'true');
    try {
      form.submit();
    } catch (err) {
      form.removeAttribute('data-native-submit');
      showError(transportText);
    }
  }

  consent.addEventListener('change', function () {
    if (consent.checked && errorEl.textContent === consentText) errorEl.textContent = '';
  });

  // The checkbox is required, so an ordinary click never fires submit while it is unticked.
  button.addEventListener('click', function (event) {
    if (consent.checked) return;
    event.preventDefault();
    errorEl.textContent = consentText;
    consent.focus();
  });

  form.addEventListener('submit', function (event) {
    if (form.getAttribute('data-native-submit') === '1') return;
    event.preventDefault();
    if (pending) return;
    errorEl.textContent = '';
    if (!consent.checked) {
      errorEl.textContent = consentText;
      consent.focus();
      return;
    }
    if (!emailInput.checkValidity()) {
      emailInput.reportValidity();
      return;
    }

    pending = true;
    button.disabled = true;
    button.textContent = 'Signing you up...';
    form.setAttribute('aria-busy', 'true');
    var settled = false;
    // Some iOS in-app browsers abort or stall a cross-origin fetch, especially with AbortSignal.
    var controller = typeof AbortController === 'function' ? new AbortController() : null;
    var timer;

    function fallback() {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      if (controller) {
        try { controller.abort(); } catch (ignore) {}
      }
      nativeSubmit();
    }

    timer = window.setTimeout(fallback, 15000);

    var params = new URLSearchParams();
    Array.prototype.forEach.call(form.elements, function (el) {
      if (!el.name || el.type === 'checkbox' || el.type === 'submit' || el.type === 'button') return;
      params.append(el.name, el.value);
    });
    // Leave Content-Type to URLSearchParams so this stays a simple CORS request (no preflight).
    var endpoint = form.action + (form.action.indexOf('?') === -1 ? '?' : '&') + 'isAjax=1';
    var fetchOptions = {
      method: 'POST',
      mode: 'cors',
      credentials: 'omit',
      redirect: 'error',
      headers: { 'Accept': 'application/json' },
      body: params
    };
    if (controller) fetchOptions.signal = controller.signal;

    fetch(endpoint, fetchOptions).then(function (response) {
      if (settled) return;
      return response.text().then(function (text) {
        if (settled) return;
        var data;
        try {
          data = JSON.parse(text);
        } catch (err) {
          fallback();
          return;
        }
        if (settled) return;
        if (response.ok && data && data.success === true) {
          settled = true;
          window.clearTimeout(timer);
          window.location.assign('thank-you.html');
          return;
        }
        if (data && data.success === false) {
          settled = true;
          window.clearTimeout(timer);
          showError(brevoMessage(data) || failText);
          return;
        }
        fallback();
      });
    }).catch(function () {
      fallback();
    });
  });
})();
