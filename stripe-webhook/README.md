# Stripe Webhook Worker

Cloudflare Worker that receives Stripe webhook events and updates Supabase.

## Handles
- `checkout.session.completed`

## Effects
- Updates matching `orders` row from `checkout_started` -> `paid`
- Writes buyer and payment fields
- Marks related artwork `reserved`

## Required Worker secrets
- `STRIPE_WEBHOOK_SIGNING_SECRET`
- `STRIPE_SECRET_KEY`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
