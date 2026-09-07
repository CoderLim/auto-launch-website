# Post-launch payment provider check

Launch automation deploys the Worker and seeds analytics into D1. **It does not configure payment providers.** Sites with credits / checkout / subscriptions will show a working pricing UI but fail at “Continue” / checkout until Admin (or D1 `config`) has a live provider.

## When this applies

Any site that sells credits, subscriptions, or one-time checkout after free quota — e.g. ShipAny + Waffo Pancake, Stripe, Creem.

Mark it in `site.config.json` so launch/status prints a reminder:

```json
"payments": { "enabled": true }
```

If the flag is missing but the product clearly has paywalls, still run this checklist before claiming launch done.

## Required checklist (do after production-audit)

1. **Confirm free-quota → paywall path**
   - Exhaust free removes/credits (or set D1 usage to the daily cap).
   - Trigger checkout from the live site. You must **not** see:
     - `No payment provider configured. Enable Waffo in Admin → Settings.`
     - (or the equivalent for Stripe/Creem)

2. **Provider rows in D1 `config` (Workers / ShipAny)**

   Minimum for Waffo Pancake:

   | name | expected |
   |------|----------|
   | `waffo_enabled` | `true` |
   | `default_payment_provider` | `waffo` |
   | `waffo_merchant_id` | non-empty |
   | `waffo_private_key` | non-empty |
   | `waffo_store_id` | non-empty |
   | `waffo_environment` | `test` or `prod` |
   | `waffo_product_ids_mapping` | JSON mapping catalog SKUs → `PROD_*` |

   Verify without dumping secrets:

   ```bash
   npx wrangler d1 execute <db-name> --remote --command \
     "SELECT name, length(value) AS vlen,
             CASE WHEN name LIKE '%private%' OR name LIKE '%secret%' OR name LIKE '%key'
                  THEN '***' ELSE substr(value,1,40) END AS preview
      FROM config
      WHERE name LIKE '%waffo%' OR name = 'default_payment_provider'
      ORDER BY name;"
   ```

3. **Public config**

   ```bash
   curl -sS "https://<domain>/api/config/public" | jq '{waffo_enabled: .data.waffo_enabled, default_payment_provider: .data.default_payment_provider}'
   ```

   Expect `waffo_enabled: "true"` and `default_payment_provider: "waffo"` (or your chosen provider).

4. **Smoke checkout**
   - Click Continue on a credit pack → redirects to the provider checkout URL.
   - Webhook URL registered at the provider: `https://<domain>/api/payment/notify/<provider>` (Waffo: `.../waffo`).
   - Prefer `test` credentials for first live smoke; switch `waffo_environment` to `prod` only with production merchant keys.

5. **Where to configure**
   - Preferred: live site `/admin` → Settings → Payment → enable provider + save.
   - Or upsert the same keys into D1 `config` (same pattern as R2 / Replicate). Plaintext rows work; if `CONFIG_ENCRYPTION_KEY` is set, Admin UI encrypts secrets on save.
   - Copy keys from a known-good sibling project’s local env only when intentionally sharing a **test** merchant.

## Do not

- Treat “pricing modal opens” as payment readiness — that UI does not require a provider.
- Skip this because analytics / GSC / hreflang already passed.
- Commit merchant private keys into git or skill docs.
