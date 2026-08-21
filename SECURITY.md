# FinScanix

## Security Notice — DO NOT COMMIT .env

**This file contains live credentials. If you see a `.env` file in this repository, it must be removed immediately.**

1. Rotate ALL credentials listed below through their respective dashboards
2. Purge from git history: `git filter-repo --path .env --invert-paths`
3. Force-push and inform all contributors to re-clone

### Credentials to rotate
| Secret | Where |
|--------|-------|
| DATABASE_URL / DIRECT_URL password | Supabase → Project Settings → Database → Connection pooling |
| SUPABASE_SERVICE_ROLE_KEY | Supabase → Project Settings → API → Service Role |
| CRON_SECRET | Generate: `openssl rand -base64 32`; update in Railway env vars |
| GOOGLE_AI_API_KEY | Google AI Studio → API Keys → Revoke & regenerate |
| RAZORPAY_KEY_ID / SECRET / WEBHOOK_SECRET | Razorpay Dashboard → Settings → API Keys |
| ANTHROPIC_API_KEY | Anthropic Console → API Keys |
| SERPER_API_KEY | Serper.dev dashboard |
| SEED_PASSWORD | Development only; rotate after rotating DB |
