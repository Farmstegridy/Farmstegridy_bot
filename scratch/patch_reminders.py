with open('services/smart_reminders.js', 'r', encoding='utf-8') as f:
    content = f.read()

x_engine_import = """const { analyzeUserTimePattern, heavyRanker, generateDynamicMessage } = require('./x_engine');"""
if "x_engine" not in content:
    content = content.replace("const { COL_USERS", x_engine_import + "\nconst { COL_USERS")

new_cron = """async function processReminders() {
    try {
        const { data: users } = await supabase.from(COL_USERS).select('*');
        if (!users) return;

        const currentHour = new Date().getHours();
        const currentDay = new Date().getDay();

        for (const user of users) {
            const history = user.data.view_history || [];
            
            // X-Engine: Time Prediction
            const timePattern = analyzeUserTimePattern(history);
            
            // Should we contact now? (1 hour before their usual time)
            let targetHour = timePattern.bestHour - 1;
            if (targetHour < 0) targetHour = 23;

            // Only send if it's the right time and we haven't sent a reminder today
            const lastReminder = user.data.last_x_reminder ? new Date(user.data.last_x_reminder).getDate() : null;
            const today = new Date().getDate();

            if (currentHour === targetHour && lastReminder !== today) {
                // X-Engine: Ranker & Templating
                const rankResult = heavyRanker(history, !user.data.has_ordered);
                const message = generateDynamicMessage(user, rankResult, timePattern);

                await eventBus.emit('send_message', {
                    chatId: user.telegram_id,
                    text: message,
                    keyboard: {
                        inline_keyboard: [[{ text: '🚀 Créer mon Bot', web_app: { url: process.env.WEB_APP_URL } }]]
                    }
                });

                // Update last reminder
                await supabase.from(COL_USERS).update({
                    data: { ...user.data, last_x_reminder: new Date().toISOString() }
                }).eq('telegram_id', user.telegram_id);
                
                console.log(`[X-Engine] Relance envoyée à ${user.telegram_id} (Rank: ${rankResult.category})`);
            }
        }
    } catch (e) {
        console.error('[X-Engine] Erreur CRON:', e);
    }
}"""

# Replace the old processReminders
import re
content = re.sub(r'async function processReminders\(\) \{[\s\S]*?\} catch \(e\) \{[\s\S]*?\}[\s]*\}', new_cron, content)

with open('services/smart_reminders.js', 'w', encoding='utf-8') as f:
    f.write(content)

