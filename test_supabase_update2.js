require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

const keys = [
  "bot_name", "dashboard_title", "accent_color", "admin_telegram_id", "admin_password", 
  "dashboard_url", "private_contact_url", "private_contact_wa_url", "channel_url", "custom_links",
  "points_ratio", "points_exchange", "points_credit_value", "ref_bonus", "fidelity_bonus_thresholds",
  "fidelity_bonus_amount", "fidelity_min_spend", "languages", "welcome_message", "payment_modes",
  "msg_choose_qty", "payment_modes_config", "ui_icon_catalog", "label_catalog", "ui_icon_orders",
  "label_my_orders", "ui_icon_contact", "label_contact", "ui_icon_profile", "label_profile",
  "ui_icon_livreur", "label_livreur_space", "ui_icon_admin", "label_admin_bot", "ui_icon_web",
  "label_admin_web", "ui_icon_wallet", "ui_icon_points", "ui_icon_channel", "label_channel",
  "ui_icon_welcome", "label_welcome", "status_pending_label", "msg_order_received_admin",
  "msg_order_confirmed_client", "btn_livreur_space", "btn_back_menu", "msg_status_taken",
  "msg_status_delivered", "msg_delay_report", "msg_arrival_soon", "msg_review_prompt",
  "msg_review_thanks", "btn_leave_review", "btn_view_reviews", "btn_confirm_review",
  "btn_back_menu_nav", "btn_cart_resume", "btn_client_mode", "msg_thanks_participation",
  "msg_your_answer", "btn_back_generic", "btn_back_quick_menu", "btn_back_to_cart",
  "btn_back_to_qty", "btn_back_to_address", "btn_back_to_options", "btn_back_to_livreur_menu",
  "btn_next", "btn_previous", "btn_clear_cart", "btn_cancel_order", "btn_cancel_my_order",
  "btn_abandon_delivery", "btn_send_now", "btn_help_support", "btn_where_is_delivery", "btn_cancel",
  "btn_cancel_alt", "btn_dont_use_credit", "btn_set_available", "btn_notify_30min", "btn_notify_10min",
  "btn_rate_5", "btn_rate_4", "btn_rate_3", "btn_rate_1", "msg_session_expired", "msg_product_not_found",
  "msg_order_not_available", "msg_order_not_found", "msg_order_creation_error", "msg_not_livreur",
  "msg_access_denied", "msg_catalog_empty", "msg_cart_empty", "msg_no_reviews_yet", "msg_no_information",
  "msg_no_active_deliveries", "msg_empty_delivery_history", "msg_no_active_orders", "msg_cart_cleared",
  "msg_thanks_for_feedback", "msg_location_updated", "msg_livreur_welcome"
];

(async () => {
    let failedKeys = [];
    for (let key of keys) {
        const payload = {};
        payload[key] = null; // update it to null to test existence
        const { error } = await supabase.from('bot_settings').update(payload).eq('id', 'default');
        if (error && error.code === 'PGRST204') {
            failedKeys.push(key);
        }
    }
    console.log("Failed keys:");
    console.log(failedKeys);
})();
