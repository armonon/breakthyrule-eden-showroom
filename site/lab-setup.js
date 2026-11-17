(() => {
  'use strict';

  // Read the private fragment before rendering. Never persist or send it in a URL.
  let setupToken = new URLSearchParams(location.hash.slice(1)).get('token') || '';
  if (location.hash) history.replaceState(null, '', location.pathname + location.search);

  document.addEventListener('DOMContentLoaded', () => {
    const $ = id => document.getElementById(id);
    const form = $('setup-form'), fields = $('setup-fields');
    const password = $('setup-password'), confirmation = $('setup-confirm');
    const submit = $('setup-submit'), retry = $('setup-retry');
    let busy = false, complete = false;

    function clearSecrets() {
      setupToken = '';
      password.value = '';
      confirmation.value = '';
      password.type = confirmation.type = 'password';
      $('setup-show').checked = false;
    }

    function showState(title, description, focus = false) {
      $('setup-title').textContent = title;
      $('setup-description').textContent = description;
      if (focus) $('setup-title').focus();
    }

    function closeSetup(title, description) {
      clearSecrets();
      form.hidden = true;
      fields.disabled = true;
      retry.hidden = true;
      showState(title, description, true);
    }

    function serverMessage(data, fallback) {
      return typeof data?.error === 'string' && data.error.trim() ? data.error.slice(0, 400) : fallback;
    }

    async function request(options = {}) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 20000);
      try {
        const response = await fetch('/api/lab/setup-owner', {
          cache: 'no-store', credentials: 'same-origin', redirect: 'error',
          ...options, signal: controller.signal
        });
        const data = await response.json().catch(() => ({}));
        return { response, data };
      } finally {
        clearTimeout(timeout);
      }
    }

    async function checkAvailability() {
      if (busy || complete) return;
      busy = true;
      retry.hidden = true;
      form.hidden = true;
      showState('Checking your setup link', 'Please wait while we check whether owner setup is available.');
      try {
        const { response, data } = await request();
        if (!response.ok || typeof data.available !== 'boolean') throw new Error('unavailable');
        if (!data.available) {
          closeSetup('Owner setup is unavailable', 'This link has expired or the studio owner is already configured. If you have a studio account, use the sign-in link below.');
        } else if (!/^[a-f0-9]{64}$/i.test(setupToken)) {
          closeSetup('Open your private setup link', 'Use the complete owner setup link you were given. If it has expired, a new setup link is needed.');
        } else {
          showState('Set your studio password', 'Choose a password for the owner account. You will use it to sign in to Break Thy Rule Studio.');
          fields.disabled = false;
          form.hidden = false;
        }
      } catch {
        showState('Setup could not be reached', 'Please try again. Your password has not been submitted.');
        retry.hidden = false;
      } finally {
        busy = false;
      }
    }

    retry.addEventListener('click', checkAvailability);
    $('setup-show').addEventListener('change', event => {
      password.type = confirmation.type = event.target.checked ? 'text' : 'password';
    });
    for (const input of [password, confirmation]) input.addEventListener('input', () => {
      confirmation.setCustomValidity('');
      $('setup-error').textContent = '';
    });

    form.addEventListener('submit', async event => {
      event.preventDefault();
      if (busy || complete || !setupToken) return;
      $('setup-error').textContent = '';
      confirmation.setCustomValidity(password.value === confirmation.value ? '' : 'The passwords do not match.');
      if (!form.reportValidity()) return;
      if (password.value.length < 12 || password.value.length > 128) {
        $('setup-error').textContent = 'Choose a password with 12–128 characters.';
        password.focus();
        return;
      }

      busy = true;
      fields.disabled = true;
      form.setAttribute('aria-busy', 'true');
      submit.textContent = 'Setting your password…';
      try {
        const { response, data } = await request({
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: setupToken, password: password.value })
        });
        if (response.ok && data.ok === true) {
          complete = true;
          clearSecrets();
          form.hidden = true;
          $('setup-error').textContent = '';
          showState('Your studio password is set', 'Your owner account is ready. Sign in with your new password.', true);
          $('setup-email').textContent = typeof data.email === 'string' ? 'Owner email: ' + data.email : '';
          $('setup-success').hidden = false;
        } else if (['invalid_setup', 'setup_unavailable'].includes(data.code) || [403, 409].includes(response.status)) {
          closeSetup('This setup link is unavailable', serverMessage(data, 'This link is invalid, expired, or already used. If your account is configured, sign in to the studio.'));
        } else {
          $('setup-error').textContent = serverMessage(data, 'Your password could not be set. Please try again.');
        }
      } catch {
        $('setup-error').textContent = 'We could not confirm setup. Try again, or sign in below with the password you just chose if setup already completed.';
      } finally {
        busy = false;
        form.removeAttribute('aria-busy');
        submit.textContent = 'Set studio password';
        if (!form.hidden) fields.disabled = false;
      }
    });

    window.addEventListener('pagehide', clearSecrets);
    window.addEventListener('pageshow', event => {
      if (event.persisted && !complete) closeSetup('Reopen your private setup link', 'For your privacy, this page cleared the setup link when you left. Reopen the original link to continue.');
    });
    checkAvailability();
  }, { once: true });
})();
