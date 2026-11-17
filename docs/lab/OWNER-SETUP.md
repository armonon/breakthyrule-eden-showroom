# First studio owner

The one-time setup flow creates the first studio owner without putting a chosen password in source, environment variables, chat or deployment tooling. The owner enters the password directly into the setup page. Existing staff accounts are never replaced by this flow.

Configure these server-only environment variables:

| Variable | Value |
| --- | --- |
| `LAB_SETUP_OWNER_EMAIL` | The owner-approved studio email. This fixed address is used even if a request supplies a different email or role. |
| `LAB_SETUP_TOKEN_SHA256` | Hex SHA-256 digest of **32 cryptographically random raw bytes**. |
| `LAB_SETUP_EXPIRES_AT` | Future UTC ISO timestamp, such as the format `YYYY-MM-DDTHH:mm:ss.sssZ`. Expiration is strict. |
| `LAB_SESSION_SECRET` | Existing studio signing secret, at least 32 characters. |

Encode the same 32 raw token bytes as **64 hexadecimal characters** in the setup URL fragment. Hash the decoded raw bytes for the environment variable, not the UTF-8 hexadecimal string. The bearer token belongs only in the user's setup link/browser memory; do not save or log it. Keep `LAB_BOOTSTRAP_OWNER` unset when using this setup flow.

The page reads and removes the URL fragment, then posts `{token,password}` to `/api/lab/setup-owner` over the shop's own origin. Passwords must contain 12–128 characters and are stored using the existing salted scrypt password routine. The owner enters the password themselves. A successful response is `201 {ok:true,email}` with the fixed account email; no session is created. The user then signs in through the existing studio login.

`GET /api/lab/setup-owner` returns only `{available:boolean}`. Neither this response nor unsuccessful setup responses disclose the account email. The endpoint is unavailable if any staff record exists, setup was already claimed, configuration is absent/invalid/expired, the session secret is missing/too short, or legacy bootstrap configuration is present. Responses disable caching. Cross-origin submissions and setup bodies over 2 KiB are rejected.

A permanent `auth/owner-setup-claim` record is created atomically before the account, and the staff record is also written only if new. Concurrent requests cannot overwrite the winning password, and removing an account or rotating the setup token does not reopen setup. Keep the claim after successful creation. Remove the setup environment variables after the owner completes setup.

If storage fails after claiming but before creating the account, setup deliberately remains closed. An operator must inspect the claim and all staff records before recovery. Disable or expire the old setup configuration first; only if no staff account was created may the operator clear the interrupted claim and issue a fresh token/expiry. There is no public reset or claim-deletion endpoint.

Run the focused runtime checks with:

```sh
node --test server/lab/owner-setup.test.mjs
```

Tests generate temporary tokens and passwords in memory. They cover owner creation and login, rejected tokens/passwords, strict expiration, existing staff, replay, concurrent instances, account creation contention, interrupted storage and request boundaries. They do not contact any account service.
