# Auth testing playbook (VERIDEX)
1. Login: `curl -X POST $API/api/auth/login -H 'Content-Type: application/json' -d '{"email":"admin@veridex.dev","password":"Veridex!2026"}'` → returns `{user, access_token}` and sets `access_token` httpOnly cookie.
2. `curl $API/api/auth/me -H "Authorization: Bearer <token>"` → same user.
3. Wrong password 5× from same IP+email → 429 lockout for 15 min.
4. Mongo: `db.users.findOne({email:"admin@veridex.dev"})` → `password_hash` starts with `$2b$`; unique index on `users.email`.
5. Protected endpoints return 401 without token; non-members get 404 on private projects; viewers get 403 on write actions.
