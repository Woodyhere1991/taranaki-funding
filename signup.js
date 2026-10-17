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
  var uncertainText = "We couldn't confirm your signup. Check your inbox and spam for a confirmation email before trying again. Your email is still here. If needed, email nzfundinglist@gmail.com for help.";
  var failText = 'Your signup was not accepted. Please try again, or email nzfundinglist@gmail.com for help.';

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

  form.addEventListener('submit', function (event) {
    event.preventDefault();
    if (pending) return;
    errorEl.textContent = '';
    if (!consent.checked) {
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
    var controller = typeof AbortController === 'function' ? new AbortController() : null;
    var timer;

    function fail(message) {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      pending = false;
      button.disabled = false;
      button.textContent = readyLabel;
      form.removeAttribute('aria-busy');
      errorEl.textContent = message;
    }

    // The server may have accepted a timed-out request. Never replay it automatically.
    timer = window.setTimeout(function () {
      fail(uncertainText);
      if (controller) controller.abort();
    }, 15000);

    var params = new URLSearchParams();
    Array.prototype.forEach.call(form.elements, function (el) {
      if (!el.name || el.type === 'checkbox' || el.type === 'submit' || el.type === 'button') return;
      params.append(el.name, el.value);
    });
    var endpoint = form.action + (form.action.indexOf('?') === -1 ? '?' : '&') + 'isAjax=1';

    (async function () {
      try {
        var response = await fetch(endpoint, {
          method: 'POST',
          mode: 'cors',
          redirect: 'error',
          headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/x-www-form-urlencoded'
          },
          body: params,
          signal: controller ? controller.signal : undefined
        });
        if (settled) return;
        if (response.redirected || response.type === 'opaqueredirect') {
          fail(uncertainText);
          return;
        }
        var data;
        try {
          data = JSON.parse(await response.text());
        } catch (err) {
          fail(uncertainText);
          return;
        }
        if (settled) return;
        // Brevo's AJAX form response must explicitly acknowledge success.
        if (response.ok && data && data.success === true) {
          settled = true;
          window.clearTimeout(timer);
          window.location.assign('thank-you.html');
          return;
        }
        fail(data && data.success === false ? (brevoMessage(data) || failText) : uncertainText);
      } catch (err) {
        fail(uncertainText);
      }
    })();
  });
})();
