# Square checkout activation

Owner enrollment completed on November 17, 2026. The one-time setup variables were removed after verifying the active owner record and consumed claim. Production is configured for Square live checkout, no tax, $10 US / $25 international first-class shipping, and explicit unlimited made-to-order inventory/capacity. The Git deployment containing this note activates the live environment switch. Normal garments and accessories are ready; Mystery/Relic packages retain their unpublished-policy gate. Sandbox payments/refunds and signed production endpoint checks passed; no real production card charge was performed.

The public cart still uses `/api/lab/checkout`. Set `LAB_PAYMENT_PROVIDER=square` to use Square-hosted checkout. Canonical product prices, variants, artwork and production specifications stay in `labkit`; the browser cannot choose the charge amount. Square receives an itemized order and returns a hosted checkout URL. Customer card details never enter this application.

The running API is `server/lab/storefront-api.mjs` through `server/lab/api.mjs`, with Square behavior in `square.mjs` and `square-orders.mjs`. The older `service.mjs` is retained for its legacy tests; it is not the Netlify entry point. Do not rebuild the recovered API from the older service.

## Configuration

Enter secrets in Netlify's environment-variable settings for this site's Functions scope. Never commit them or paste them into chat. Sandbox and production credentials, webhook signatures and stores must be separate. No secret is required in browser JavaScript.

| Variable | Value |
| --- | --- |
| `LAB_PAYMENT_PROVIDER` | `square` |
| `SQUARE_ENVIRONMENT` | `sandbox` initially; `production` for real checkout |
| `SQUARE_ACCESS_TOKEN` | Token for the selected Square environment and business |
| `SQUARE_LOCATION_ID` | Square location in that same environment; the shop currently prices in USD |
| `SQUARE_WEBHOOK_SIGNATURE_KEY` | Signature key from the webhook subscription |
| `SQUARE_WEBHOOK_URL` | Exact HTTPS subscription URL, including path and trailing-slash choice: `https://<site>/api/lab/square-webhook` |
| `LAB_PUBLIC_URL` | Canonical HTTPS storefront origin used for the order return page |
| `SQUARE_SHIPPING_MODE` | `regional` for the shop’s two shipping rates; `flat` or unset for older fixtures |
| `SQUARE_US_SHIPPING_CENTS` | `1000` ($10) for a United States address |
| `SQUARE_INTERNATIONAL_SHIPPING_CENTS` | `2500` ($25) for an address outside the United States |
| `SQUARE_SHIPPING_CENTS` | Flat-mode fixtures only: explicit integer USD cents |
| `SQUARE_TAX_MODE` | `catalog` to use configured Square taxes, or `none` only when intentionally charging no tax |
| `SQUARE_TAX_IDS` | Comma-separated Square CatalogTax object IDs when mode is `catalog` |
| `LAB_ALLOW_LIVE` | Keep unset until a verified launch; must equal `true` for production Square checkout |
| `LAB_SESSION_SECRET` | Existing private studio-session signing secret; at least 32 characters |
| `LAB_STORE` | `blobs` on Netlify; use `memory` or `file` only for local fixtures |

Use an access token with the required Square payment/order permissions: `ORDERS_READ`, `ORDERS_WRITE`, `PAYMENTS_READ`, and `PAYMENTS_WRITE`. Configure the webhook subscription for `payment.created`, `payment.updated`, `refund.created`, and `refund.updated`. API version is pinned to `2026-09-16`.

The existing studio launch gates still apply in live mode: verified size charts, confirmed shipping/tax configuration, and published mystery-package policies when applicable. Configure product availability through the studio before offering those items. Square configuration alone does not populate availability or approve policy text.

## Made-to-order availability

The owner selected made-to-order sales without a stock limit. This uses an explicit `unlimited: true` flag on each recognized `inventory.skus[sku]` and `capacity.slots[slot]` record. It does not manufacture a large stock quantity or capacity limit. Missing records remain unavailable until configured.

- Active unlimited public entries return `{ unlimited: true, available: null }`. Finite entries retain their numeric availability. A capacity record with `open: false` stays closed even if its stored unlimited flag is true; its public entry is `{ unlimited: false, available: 0 }`.
- Reserved quantities and completed-production `used` counters remain real. Retries, payments, cancellation and refunds keep their existing idempotent receipts. Unlimited SKU payments do not decrement `onHand`; full refunds do not create physical stock.
- Studio stock updates accept `{ sku, onHand, unlimited }`; capacity updates accept `{ slot, limit, open, leadTimeDays, unlimited }`. Omitting `unlimited` preserves the existing value. The API requires an actual boolean when supplied.
- Switching an unlimited SKU back to finite requires enough declared `onHand` to cover active holds. Switching an active unlimited capacity slot back to finite requires a limit covering existing `used + reserved`; closing the slot remains available independently. Unexpected manual-store changes that would make a paid SKU count negative send that order to review.
- Enabling unlimited availability does not attest size charts, publish mystery policies, establish production lead times or switch on live payments. Those settings remain independent. The local seed fixture remains intentionally finite and should not be used to initialize production made-to-order availability.

## Shipping and tax scope

The owner selected **first-class shipping: $10 within the United States and $25 internationally**, with **no tax charged at this time** (`SQUARE_TAX_MODE=none`). Regional checkout requires `shippingRegion` to be exactly `us` or `international`. The server selects the corresponding configured rate and includes it in the durable checkout fingerprint and order; client-supplied prices or shipping amounts are ignored. `/api/lab/status` exposes the public shipping mode, rates and label for the cart selector. United States checkout prepopulates Square's shipping country as `US`.

Square collects the actual address on its hosted page. A shopper can edit that address, so the integration verifies the final country again from Square's payment/order after payment: `US` must match the $10 option, and another country must match the $25 option. A missing country or mismatch enters studio review and does not begin production or consume the inventory hold. **This check happens after payment**; it does not prevent an incorrect rate from being paid on Square. Staff must contact the customer or fully refund the order and have them select the correct destination. A full confirmed refund releases an unconsumed review hold. A stricter pre-payment restriction would require an address-first custom checkout or additional Square configuration.

Tips, coupon redemption, loyalty discounts and automatic catalog discounts are disabled. Flat shipping and explicit Square catalog tax IDs remain supported for other configurations/fixtures. Regional shipping is a fixed fee, not a carrier quote; the fulfillment staff choose the actual shipping service. The two rates treat America as the United States, with all other countries using the international tier.

## Verification before real checkout

### Current sizing decision

The owner requested Shaka Wear references from the Ghost Studio garment list and explicitly chose no Cut & Sew chart for now. `/size-guide` publishes the seven supplier charts verified against the official Shaka pages on 2026-11-17, plus a separately labeled Shaka sweat-shorts reference. These are named supplier references, not inferred 3D-model measurements or measurements of house patterns. The inconsistent sweatpants length row is omitted with an explanation and source link. Canvas checkout accepts S–XXL (XXL corresponds to supplier 2XL); Cut & Sew retains XS–XXL with an explicit no-chart notice. Hanes/Daily Apple and mystery sizing are separate.

For this owner-approved policy, the size-chart launch flag means the published supplier guidance has been verified; it does not assert that Cut & Sew measurements exist. Do not manufacture Cut & Sew data or apply Shaka charts to Hanes products.

1. Deploy the function and ensure `/api/lab/status` returns JSON rather than the old static API-unavailable response. Route `/api/lab/*` to the Netlify `lab` function before the generic `/api/*` fallback.
2. Configure sandbox values, stock and capacity. Create a cart with a real variant and artwork selection. Confirm the Square checkout shows the same products, quantities, subtotal, shipping and tax.
3. Complete a Square sandbox payment. Confirm a signed webhook changes the local order to paid and consumes stock/capacity exactly once. Merely following the return URL must leave an unpaid order pending.
4. Retry the webhook and simulate a failed request. Confirm there is one order, one payment link and one inventory adjustment. Test a partial refund and a full refund in sandbox, including refunds initiated from Square Dashboard.
5. Confirm shipping-address capture, order access links, studio order review, cancellation and mystery-package launch gates.
6. Configure separate production variables, verify the production Square location and webhook, then set `LAB_ALLOW_LIVE=true` only when the actual launch checks are complete.

The automated tests mock Square at the HTTP boundary. They do not prove that the merchant token, location, tax objects, webhook subscription, DNS or deployment is configured correctly. No live payment has been made by these tests.

## Payment and inventory lifecycle

- A durable checkout request stores a fingerprint and exact Square request. Changed carts cannot reuse a checkout key. Lost network responses retry the same Square idempotency key and preserve the same local order and resource hold.
- Payment notifications require a constant-time HMAC check over the exact configured URL and raw body. The handler then retrieves the payment and order from Square and checks location, order identity, product prices, quantities, currency and totals before allowing production.
- The redirect is informational. Only a verified `COMPLETED` payment can confirm the order. Mismatches enter studio review and do not start production.
- Event receipts and per-order resource receipts make repeated and concurrent deliveries idempotent. Retain these receipts with the order records; deleting them can break replay protection.
- Square payment links do not expire automatically. After 35 minutes, a bounded reconciliation checks one abandoned checkout when the next checkout starts or the studio lists orders. It recovers an ambiguous link creation, checks for pending/approved/completed payments, deletes an unpaid link, and requires Square's order state to be `CANCELED` before releasing its hold. Staff can also cancel directly. If Square is unreachable or a payment is processing, the hold remains for review; time alone never releases it. There is no scheduled background job in this change.
- If link creation timed out, retrying the same cart or canceling it from the studio recovers the original link with the stored request and idempotency key. The app preserves the hold while the remote outcome is uncertain. A first definitive rejected creation closes the request and releases its hold; the cart must then generate a new checkout key. The original Square environment and location must remain connected to reconcile an older checkout.
- Refund requests are idempotent for the same payment, refunded balance and amount. Pending refunds do not become completed just because the request was accepted. Subsequent notifications retrieve Square's cumulative refunded balance. A full refund of an order still held for review releases that unconsumed hold. Refunds never restore already committed physical inventory or production capacity; staff decide whether returned/custom goods are reusable.
- Square's order can remain `OPEN` after its payment is complete. The app uses the payment's status, not the Square order state, for fulfillment approval.

## Checks

```sh
node --test server/lab/square.test.mjs server/lab/storefront-api.test.mjs server/lab/accessory-packs.test.mjs
```

Official contracts: [CreatePaymentLink](https://developer.squareup.com/reference/square/checkout-api/create-payment-link), [checkout options](https://developer.squareup.com/reference/square/objects/CheckoutOptions), [webhook verification](https://developer.squareup.com/docs/webhooks/step3validate), [payment-link lifecycle](https://developer.squareup.com/docs/checkout-api/common-pitfalls), [refunds](https://developer.squareup.com/docs/payments-api/refund-payments).
