# Contact privacy rollout (do not deploy until security prerequisites pass)

1. In Supabase Settings > API Keys, create a fresh server-only secret key. Put it in Render as SUPABASE_KEY, and set SUPABASE_URL to the project URL. Do not commit, share, or log the key. Configure a distinct strong admin password and JWT signing secret; never use a database key to sign admin tokens.
2. Verify all legitimate consumers use the new credential, then disable the compromised legacy API keys. Review access logs, investigate possible unauthorized access, and rotate other exposed credentials. A Git commit does not revoke an old key.
3. Review database access requirements. Restrict bot tables to the server role; confirm no legitimate browser or other client relies on public table access. Enable RLS and revoke unneeded grants; verify normal reads/writes under the server role and denied anon access. Do not add new profile data while this is unresolved.
4. Apply docs/contact_privacy.sql only after steps 1–3. Verify RLS, grants and uniqueness of (telegram_user_id, telegram_bot_id).
5. Review authenticated endpoints and all outbound notification/broadcast paths. Optional contact must fail closed without explicit consent for the current bot; no marketing permission is implied. The current patch covers the admin text support reply path only. Do not enable the feature while other optional contact paths bypass it.
6. Run node --test tests/contact_privacy.test.js in an isolated test environment. Verify /privacy acceptance and revocation, a different bot ID, username updates, no-username accounts, support delivery failure, and existing profile preservation using only controlled test accounts. Check that no personal data is logged.
7. Merge and deploy only after checks pass. Set CONTACT_PRIVACY_ENABLED=true only after migration and tests. Confirm the user can withdraw the preference and that blocked accounts remain unreachable. Never treat API acceptance as a read receipt.

No production database changes, message sends, or deployments are performed by this draft.


## Optional order-contact telephone number — proposed requirements, not implemented

**Release blocked:** do not collect real phone numbers until exposed privileged keys have been revoked, existing customer data access has been secured, the independent database and media backup has been verified, and the maintainer has approved the changes and resolved the pull request merge conflicts.

- In a private chat, offer an optional button “Partager mon numéro” for a defined current order support purpose and a “Continuer sans partager” alternative. Use Telegram's native request_contact button. Explain the purpose, retention period, access and deletion rights before asking.
- Accept only a contact intentionally supplied after the current user's request; require contact.user_id to match ctx.from.id, private chat identity to match, and the current bot identity to be verified. Reject forwarded or third-party contacts and missing identity. Expire pending prompts. Do not infer consent from profile membership.
- Keep phone data separate from publicly accessible profiles; restrict all reads and writes to authorized service components, enable RLS and revoke public/anon/authenticated privileges. Scope records to the current bot and relevant service purpose. Do not carry consent across bots. Do not create bulk export, marketing, SMS campaigns or alternate contact paths for blocked users.
- Allow refusal, correction and deletion. Set an explicit short retention policy appropriate to order support and delete numbers when no longer needed. Never log contact payloads or phone numbers, including debug/error output; avoid returning numbers in general dashboard/API responses.
- Test with synthetic data and controlled accounts: share own contact, refuse, reject another contact, reject group contact, expire prompt, update or delete, unavailable database, unauthorized access denied, existing profiles/orders/inventory unchanged, and feature disabled by default. Verify backup/restore before release.
- Resolve this draft PR against current main; do not overwrite the already deployed database-secret fix. Have the original maintainer validate the changes and warranty implications before merging or deploying.

References: https://core.telegram.org/bots/api#keyboardbutton and https://supabase.com/docs/guides/database/postgres/row-level-security

This is a design and release checklist only. No telephone collection code, migration, contact request, production change or deployment is performed by this addition.
