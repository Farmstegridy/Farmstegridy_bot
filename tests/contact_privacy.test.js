'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { identity, hasServiceContactConsent, POLICY } = require('../services/contact_privacy');
function mockDb(data, error = null) {
    let matched;
    return {
        get matched() { return matched; },
        from(table) {
            assert.equal(table, 'bot_contact_preferences');
            return { select() { return { match(ids) {
                matched = ids;
                return { async maybeSingle() { return { data, error }; } };
            } }; } };
        }
    };
}
test('only genuine private context with matching user and chat IDs is accepted', () => {
    const context = { chat: { type: 'private', id: 42 }, from: { id: 42 }, botInfo: { id: 7 } };
    assert.deepEqual(identity(context), { telegram_user_id: '42', telegram_bot_id: '7' });
    assert.equal(identity({ ...context, chat: { type: 'group', id: 42 } }), null);
    assert.equal(identity({ ...context, botInfo: {} }), null);
    assert.equal(identity({ ...context, chat: { type: 'private', id: 43 } }), null);
    assert.equal(identity({ ...context, from: { id: 42, is_bot: true } }), null);
});
test('consent is explicit, current-version, scoped to current bot, and fail-closed', async () => {
    const original = process.env.CONTACT_PRIVACY_ENABLED;
    try {
        const accepted = mockDb({ service_contact_allowed: true, policy_version: POLICY });
        process.env.CONTACT_PRIVACY_ENABLED = 'false';
        assert.equal(await hasServiceContactConsent(accepted, 7, 42), false);
        process.env.CONTACT_PRIVACY_ENABLED = 'true';
        assert.equal(await hasServiceContactConsent(accepted, 7, 42), true);
        assert.deepEqual(accepted.matched, { telegram_user_id: '42', telegram_bot_id: '7' });
        assert.equal(await hasServiceContactConsent(mockDb(null), 8, 42), false);
        assert.equal(await hasServiceContactConsent(mockDb({service_contact_allowed:false,policy_version:POLICY}),7,42),false);
        assert.equal(await hasServiceContactConsent(mockDb({service_contact_allowed:true,policy_version:'old'}),7,42),false);
        assert.equal(await hasServiceContactConsent(mockDb(null,{code:'error'}),7,42),false);
        assert.equal(await hasServiceContactConsent({from(){throw new Error('offline');}},7,42),false);
        assert.equal(await hasServiceContactConsent(accepted, 'invalid', 42), false);
    } finally {
        if (original === undefined) delete process.env.CONTACT_PRIVACY_ENABLED;
        else process.env.CONTACT_PRIVACY_ENABLED = original;
    }
});
