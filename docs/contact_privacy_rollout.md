# Contact privacy rollout (do not deploy until security prerequisites pass)

1. In Supabase Settings > API Keys, create a fresh server-only secret key. Put it in Render as SUPABASE_KEY, and set SUPABASE_URL to the project URL. Do not commit, share, or log the key. Configure a distinct strong admin password and JWT signing secret; never use a database key to sign admin tokens.
2. Verify all legitimate consumers use the new credential, then disable the compromised legacy API keys. Review access logs, investigate possible unauthorized access, and rotate other exposed credentials. A Git commit does not revoke an old key.
3. Review database access requirements. Restrict bot tables to the server role; confirm no legitimate browser or other client relies on public table access. Enable RLS and revoke unneeded grants; verify normal reads/writes under the server role and denied anon access. Do not add new profile data while this is unresolved.
4. Apply docs/contact_privacy.sql only after steps 1–3. Verify RLS, grants and uniqueness of (telegram_user_id, telegram_bot_id).
5. Review authenticated endpoints and all outbound notification/broadcast paths. Optional contact must fail closed without explicit consent for the current bot; no marketing permission is implied. The current patch covers the admin text support reply path only. Do not enable the feature while other optional contact paths bypass it.
6. Run node --test tests/contact_privacy.test.js in an isolated test environment. Verify /privacy acceptance and revocation, a different bot ID, username updates, no-username accounts, support delivery failure, and existing profile preservation using only controlled test accounts. Check that no personal data is logged.
7. Merge and deploy only after checks pass. Set CONTACT_PRIVACY_ENABLED=true only after migration and tests. Confirm the user can withdraw the preference and that blocked accounts remain unreachable. Never treat API acceptance as a read receipt.

No production database changes, message sends, or deployments are performed by this draft.
