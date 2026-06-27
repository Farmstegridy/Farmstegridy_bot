import re

with open("services/database.js", "r") as f:
    content = f.read()

old_str = """    const encryptedData = {
        id: docId,
        telegram_id: String(platformUser.id),
        platform: platform,
        username: platformUser.username || '',
        first_name: platformUser.first_name || 'Utilisateur',
        last_name: platformUser.last_name || '',
        referral_code: existing?.referral_code || generateReferralCode(),
        referred_by: existing?.referred_by || referrerId,
        is_approved: existing ? existing.is_approved : autoApprove,
        created_at: existing?.created_at || ts()
    };"""

new_str = """    const encryptedData = {
        id: docId,
        doc_id: docId,
        platform_id: String(platformUser.id),
        platform: platform,
        username: platformUser.username || '',
        first_name: platformUser.first_name || 'Utilisateur',
        last_name: platformUser.last_name || '',
        referral_code: existing?.referral_code || generateReferralCode(),
        referred_by: existing?.referred_by || referrerId,
        is_approved: existing ? existing.is_approved : autoApprove,
        date_inscription: existing?.date_inscription || ts()
    };"""

if old_str in content:
    content = content.replace(old_str, new_str)
    
    # Remplacer aussi le retry pour enlever 'date_inscription' si ça fail
    content = content.replace(
        "if (error.message.includes('created_at')) {",
        "if (error.message.includes('created_at') || error.message.includes('date_inscription')) {"
    )
    content = content.replace(
        "delete encryptedData.created_at;",
        "delete encryptedData.created_at; delete encryptedData.date_inscription;"
    )

    with open("services/database.js", "w") as f:
        f.write(content)
    print("Patched database schema mapping in registerUser!")
else:
    print("Could not find the string to replace.")
