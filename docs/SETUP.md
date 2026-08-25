# CyberHX CTF — Final Hardened Deployment (v3)

## All Security Audit Findings: FIXED

| Finding | Severity | Status |
|---|---|---|
| Role self-escalation via API | CRITICAL | ✅ RLS WITH CHECK blocks role change |
| Anon access to all tables | CRITICAL | ✅ REVOKE ALL FROM anon + RLS auth.uid() |
| Challenge metadata exposed to anon | CRITICAL | ✅ Requires auth + is_visible |
| Email signup auto-confirm bypass | CRITICAL | ✅ Must disable in Auth settings |
| Race condition on attempt counter | HIGH | ✅ DB trigger (enforce_max_attempts) |
| Emails/roles visible to players | HIGH | ✅ safe_profiles view hides them |
| Team invite codes exposed | HIGH | ✅ public_teams view hides them |
| No rate limiting on flag submit | HIGH | ✅ 10s per-challenge + 30/min global |
| CORS wildcard on Edge Functions | HIGH | ✅ ALLOWED_ORIGINS strict check |
| No CSP header | HIGH | ✅ Added to vercel.json |
| Hint content readable directly | MEDIUM | ✅ public_hints view + RPCs only |
| Event settings exposed to anon | MEDIUM | ✅ Auth required |
| Stale Supabase URL in HTML | LOW | ✅ Removed |

---

## Deployment Steps

### 1. Create New Supabase Project
- https://supabase.com → New Project
- Save: Project URL, anon key, service_role key

### 2. Run Schema
- SQL Editor → paste `supabase/schema.sql` → Run

### 3. Configure Auth (CRITICAL)
- Dashboard → Auth → Settings:
  - **Email provider**: either DISABLE it (Google-only) or set **Confirm email = ON**
  - **Google OAuth**: configure with Google Cloud credentials
  - **CAPTCHA**: enable Cloudflare Turnstile (paste secret key)
  - **Minimum password length**: 8+

### 4. Set First Admin
- Register normally → Table Editor → profiles → change role to 'admin'

### 5. Deploy Edge Functions
```bash
npx supabase login
npx supabase link --project-ref YOUR_REF
npx supabase functions deploy submit-flag
npx supabase functions deploy scoreboard
```

Set env var: Dashboard → Edge Functions → submit-flag → Settings:
```
ALLOWED_ORIGINS=https://your-ctf-domain.com
```

### 6. Deploy Frontend
Update `frontend/.env`:
```
VITE_SUPABASE_URL=https://YOUR-REF.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
VITE_TURNSTILE_SITE_KEY=your-turnstile-site-key
```

Update `frontend/index.html` preconnect URL.

```bash
cd frontend && npm install && npx vercel --prod
```

### 7. Cloudflare (Recommended)
- DNS → point to Vercel
- WAF rules:
  - `/functions/v1/submit-flag`: 10 req/min per IP
  - `/auth/v1/*`: 20 req/min per IP
  - `/rest/v1/*`: 60 req/min per IP
- Enable: DDoS High, Bot Fight Mode, managed rules

### 8. Google OAuth Lockdown
- Google Cloud Console → Credentials → OAuth client
- Authorized redirect URIs: ONLY `https://YOUR-REF.supabase.co/auth/v1/callback`

### 9. Verify Security
```bash
# All must return [] or error:
curl -s "$URL/rest/v1/profiles?select=*" -H "apikey: $KEY" -H "Authorization: Bearer $KEY"
curl -s "$URL/rest/v1/teams?select=invite_code" -H "apikey: $KEY" -H "Authorization: Bearer $KEY"
curl -s "$URL/rest/v1/challenges?select=*" -H "apikey: $KEY" -H "Authorization: Bearer $KEY"

# Role escalation must fail (with valid user token):
curl -s -X PATCH "$URL/rest/v1/profiles?id=eq.USER_ID" \
  -H "apikey: $KEY" -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" -d '{"role":"admin"}'
# Must return: row-level security policy violation
```

---

## Security Architecture

```
Internet → Cloudflare (DDoS/WAF/Rate Limit)
         → Vercel (CSP/HSTS/X-Frame-Options)
         → Supabase Auth (CAPTCHA + OAuth + email verify)
         → RLS (every table: auth required, role-based)
         → REVOKE ALL FROM anon (defense-in-depth)
         → Edge Functions (server-side flag check, rate limit)
         → challenge_secrets (zero client access)
         → DB trigger (atomic max_attempts enforcement)
         → RPCs (SECURITY DEFINER, admin checks)
         → Audit log (immutable, service_role only)
         → Views (safe_profiles, public_teams, public_hints)
```
