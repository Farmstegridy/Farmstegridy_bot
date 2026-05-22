import json
import re
import os

with open('found_keys.json', 'r', encoding='utf-8') as f:
    found_keys = json.load(f)

# Basic dictionary to map French to EN, ES, DE
translations_map = {
    'btn_back_menu': {'en': '◀️ Back to Menu', 'es': '◀️ Volver al Menú', 'de': '◀️ Zurück zum Menü'},
    'label_shop_guide': {'en': '📖 <b>BUTTON GUIDE (SHOP)</b>', 'es': '📖 <b>GUÍA DE BOTONES (TIENDA)</b>', 'de': '📖 <b>TASTEN-ANLEITUNG (SHOP)</b>'},
    'label_shop_guide_wholesale': {'en': '📦 <b>Market Products</b>: Your <b>WHOLESALE</b> stocks for admin.', 'es': '📦 <b>Productos de Mercado</b>: Sus existencias al <b>POR MAYOR</b>.', 'de': '📦 <b>Marktprodukte</b>: Ihre <b>GROSSHANDEL</b> Bestände.'},
    'label_shop_guide_retail': {'en': '🛒 <b>Bot Products</b>: Client menu products linked to you.', 'es': '🛒 <b>Productos Bot</b>: Productos del menú vinculados a ti.', 'de': '🛒 <b>Bot-Produkte</b>: Mit Ihnen verknüpfte Produkte.'},
    'label_shop_guide_orders': {'en': '📋 <b>Orders</b>: Track sales and mark products as "Ready".', 'es': '📋 <b>Pedidos</b>: Sigue ventas y marca productos como "Listo".', 'de': '📋 <b>Bestellungen</b>: Verkäufe verfolgen und auf "Bereit" setzen.'},
    'label_shop_guide_settings': {'en': '⚙️ <b>Settings</b>: Enable/Disable Pickup or Delivery.', 'es': '⚙️ <b>Ajustes</b>: Activar/Desactivar Recogida o Entrega.', 'de': '⚙️ <b>Einstellungen</b>: Abholung/Lieferung aktivieren/deaktivieren.'},
    'msg_guide_chat_desc': {'en': 'Open direct chat with the main administrator.', 'es': 'Abrir chat directo con el administrador principal.', 'de': 'Direkten Chat mit dem Hauptadministrator öffnen.'},
    'msg_guide_stats_desc': {'en': 'View your revenue and history.', 'es': 'Ver tus ingresos e historial.', 'de': 'Ihren Umsatz und Verlauf anzeigen.'},
    'btn_back_to_shop': {'en': '◀️ Back to Shop', 'es': '◀️ Volver a la Tienda', 'de': '◀️ Zurück zum Shop'},
    'msg_quit_shop_confirm_text': {'en': '⚠️ <b>Are you sure?</b>\\n\\nYour shop will no longer be visible and you will stop receiving orders.', 'es': '⚠️ <b>¿Estás seguro?</b>\\n\\nTu tienda ya no será visible.', 'de': '⚠️ <b>Sind Sie sicher?</b>\\n\\nIhr Shop wird nicht mehr sichtbar sein.'},
    'btn_confirm_quit': {'en': '✅ Yes, quit', 'es': '✅ Sí, salir', 'de': '✅ Ja, verlassen'},
    'btn_back': {'en': '◀️ Back', 'es': '◀️ Volver', 'de': '◀️ Zurück'},
    'msg_shop_empty': {'en': '📭 Your shop is empty.\\nAdd your first product!', 'es': '📭 Tu tienda está vacía.\\n¡Añade tu primer producto!', 'de': '📭 Ihr Shop ist leer.\\nFügen Sie das erste Produkt hinzu!'},
    'btn_add_product': {'en': '➕ Add a Product', 'es': '➕ Añadir un Producto', 'de': '➕ Produkt hinzufügen'},
    'label_my_products_wholesale': {'en': '📦 <b>My Market Products ({count})</b>', 'es': '📦 <b>Mis Productos Mercado ({count})</b>', 'de': '📦 <b>Meine Marktprodukte ({count})</b>'},
    'msg_wholesale_desc': {'en': 'These products are for the administration.\\n\\n', 'es': 'Estos productos son para la administración.\\n\\n', 'de': 'Diese Produkte sind für die Verwaltung.\\n\\n'},
    'btn_add': {'en': '➕ Add', 'es': '➕ Añadir', 'de': '➕ Hinzufügen'},
    'label_price_unit': {'en': '💰 Price:', 'es': '💰 Precio:', 'de': '💰 Preis:'},
    'label_availability': {'en': '📦 Availability:', 'es': '📦 Disponibilidad:', 'de': '📦 Verfügbarkeit:'},
    'label_on_sale': {'en': '✅ On sale', 'es': '✅ A la venta', 'de': '✅ Zum Verkauf'},
    'label_out_of_stock': {'en': '❌ Hidden/Out of stock', 'es': '❌ Oculto/Agotado', 'de': '❌ Versteckt/Ausverkauft'},
    'label_category': {'en': '🏷 Category:', 'es': '🏷 Categoría:', 'de': '🏷 Kategorie:'},
    'msg_retail_pause_hint': {'en': 'You can pause this product if it is out of stock.', 'es': 'Puedes pausar este producto si está agotado.', 'de': 'Sie können dieses Produkt pausieren, wenn es ausverkauft ist.'},
    'btn_pause_label': {'en': '⏸ Pause', 'es': '⏸ Pausar', 'de': '⏸ Pausieren'},
    'btn_resume_label': {'en': '▶️ Resume', 'es': '▶️ Reanudar', 'de': '▶️ Fortsetzen'},
    'btn_back_list': {'en': '◀️ Back to List', 'es': '◀️ Volver a la Lista', 'de': '◀️ Zurück zur Liste'},
    'btn_shop_home': {'en': '🏠 Shop Menu', 'es': '🏠 Menú Tienda', 'de': '🏠 Shop Menü'},
    'msg_catalog_choice': {'en': 'Choose a product by category:', 'es': 'Elige un producto por categoría:', 'de': 'Wählen Sie ein Produkt nach Kategorie:'},
    'label_unit_price': {'en': '💰 Unit Price:', 'es': '💰 Precio Unitario:', 'de': '💰 Stückpreis:'},
    'btn_cancel': {'en': '❌ Cancel', 'es': '❌ Cancelar', 'de': '❌ Abbrechen'},
    'msg_selection': {'en': '🛒 <b>You selected: {qty} {name}</b>', 'es': '🛒 <b>Has seleccionado: {qty} {name}</b>', 'de': '🛒 <b>Sie haben gewählt: {qty} {name}</b>'},
    'label_price_total': {'en': '💰 Total Price:', 'es': '💰 Precio Total:', 'de': '💰 Gesamtpreis:'},
    'btn_add_to_cart': {'en': '🛒 Add to Cart', 'es': '🛒 Añadir al carrito', 'de': '🛒 In den Warenkorb'},
    'btn_checkout_now': {'en': '💳 Pay on delivery', 'es': '💳 Pago a la entrega', 'de': '💳 Zahlung bei Lieferung'},
    'btn_review': {'en': '⭐️ Review / Comment', 'es': '⭐️ Opinión / Comentario', 'de': '⭐️ Bewertung / Kommentar'},
    'msg_added_to_cart_notif': {'en': 'Added to cart! 🛒', 'es': '¡Añadido al carrito! 🛒', 'de': 'Zum Warenkorb hinzugefügt! 🛒'},
    'msg_cart_count': {'en': 'Your cart contains <b>{count}</b> item(s).', 'es': 'Tu carrito contiene <b>{count}</b> artículo(s).', 'de': 'Ihr Warenkorb enthält <b>{count}</b> Artikel.'},
    'btn_continue': {'en': '🛍️ Buy something else', 'es': '🛍️ Comprar otra cosa', 'de': '🛍️ Etwas anderes kaufen'},
    'btn_cart_view': {'en': '💳 Pay my order', 'es': '💳 Pagar mi pedido', 'de': '💳 Meine Bestellung bezahlen'},
    'msg_cart_empty': {'en': 'Your cart is empty 📭', 'es': 'Tu carrito está vacío 📭', 'de': 'Ihr Warenkorb ist leer 📭'},
    'btn_add_more': {'en': '🛍️ Back to Catalog', 'es': '🛍️ Volver al Catálogo', 'de': '🛍️ Zurück zum Katalog'},
    'label_total_price': {'en': 'TOTAL:', 'es': 'TOTAL:', 'de': 'GESAMT:'},
    'btn_checkout': {'en': '💳 Checkout', 'es': '💳 Pagar', 'de': '💳 Kasse'},
    'btn_clear_cart': {'en': '❌ Clear', 'es': '❌ Vaciar', 'de': '❌ Leeren'},
    'msg_min_order_error': {'en': '⚠️ <b>Minimum order not reached</b>\\n\\nWe do not deliver below <b>{min}€</b>.\\nYour current total: <b>{total}€</b>\\n\\nPlease add more products to your cart.', 'es': '⚠️ <b>Pedido mínimo no alcanzado</b>\\n\\nNo entregamos por debajo de <b>{min}€</b>.\\nTu total actual: <b>{total}€</b>\\n\\nPor favor, añade más productos.', 'de': '⚠️ <b>Mindestbestellwert nicht erreicht</b>\\n\\nWir liefern nicht unter <b>{min}€</b>.\\nIhr aktueller Gesamtbetrag: <b>{total}€</b>\\n\\nBitte fügen Sie weitere Produkte hinzu.'},
    'btn_add_products': {'en': '🛍️ Add products', 'es': '🛍️ Añadir productos', 'de': '🛍️ Produkte hinzufügen'},
    'btn_back_to_cart_label': {'en': '🛒 Back to Cart', 'es': '🛒 Volver al Carrito', 'de': '🛒 Zurück zum Warenkorb'},
    'msg_prompt_address': {'en': '📍 <b>DELIVERY ADDRESS</b>\\n\\nPlease enter your full address or choose a saved one:', 'es': '📍 <b>DIRECCIÓN DE ENTREGA</b>\\n\\nIntroduce tu dirección completa o elige una guardada:', 'de': '📍 <b>LIEFERADRESSE</b>\\n\\nBitte geben Sie Ihre vollständige Adresse ein oder wählen Sie eine gespeicherte aus:'},
    'msg_cart_items': {'en': '🛒 <b>Your Cart:</b>', 'es': '🛒 <b>Tu Carrito:</b>', 'de': '🛒 <b>Ihr Warenkorb:</b>'},
    'msg_step_address': {'en': '🏁 <b>Step 1: Delivery Address</b>', 'es': '🏁 <b>Paso 1: Dirección de entrega</b>', 'de': '🏁 <b>Schritt 1: Lieferadresse</b>'},
    'msg_choose_address': {'en': '👇 Choose a known address or send a new one:\\n\\n', 'es': '👇 Elige una dirección conocida o envía una nueva:\\n\\n', 'de': '👇 Wählen Sie eine bekannte Adresse oder senden Sie eine neue:\\n\\n'},
    'msg_send_precise_address': {'en': 'Please send your <b>precise address</b> with the <b>postal code</b> (Number, Street, ZIP, City).\\n\\n', 'es': 'Por favor, envía tu <b>dirección precisa</b> con el <b>código postal</b> (Número, Calle, CP, Ciudad).\\n\\n', 'de': 'Bitte senden Sie Ihre <b>genaue Adresse</b> mit der <b>Postleitzahl</b> (Nummer, Straße, PLZ, Stadt).\\n\\n'},
    'msg_postal_code_required': {'en': '⚠️ <i>The postal code is required.</i>\\n\\n', 'es': '⚠️ <i>El código postal es obligatorio.</i>\\n\\n', 'de': '⚠️ <i>Die Postleitzahl ist erforderlich.</i>\\n\\n'},
    'msg_address_example': {'en': '💬 <i>Example: 45 rue de la Paix, 75002 Paris</i>', 'es': '💬 <i>Ejemplo: 45 rue de la Paix, 75002 Paris</i>', 'de': '💬 <i>Beispiel: 45 rue de la Paix, 75002 Paris</i>'},
    'msg_when_delivery': {'en': '🕒 <b>When do you want to be delivered?</b>\\n\\nChoose if you want it ASAP or scheduled.', 'es': '🕒 <b>¿Cuándo deseas recibir tu pedido?</b>\\n\\nElige si lo quieres lo antes posible o programado.', 'de': '🕒 <b>Wann möchten Sie beliefert werden?</b>\\n\\nWählen Sie, ob Sie es so schnell wie möglich oder geplant haben möchten.'},
    'btn_priority_delivery': {'en': '🚀 Priority Delivery (+${price}€)', 'es': '🚀 Entrega Prioritaria (+${price}€)', 'de': '🚀 Prioritäre Lieferung (+${price}€)'},
    'btn_asap': {'en': '🏃 As soon as possible', 'es': '🏃 Lo antes posible', 'de': '🏃 So schnell wie möglich'},
    'btn_schedule': {'en': '🕒 Schedule', 'es': '🕒 Programar', 'de': '🕒 Planen'},
    'msg_delivery_details': {'en': '🏢 <b>Delivery Details (Optional)</b>\\n\\nProvide building code, floor, etc.\\n\\nOtherwise, click below:', 'es': '🏢 <b>Detalles de entrega (Opcional)</b>\\n\\nIndica código del edificio, piso, etc.\\n\\nDe lo contrario, haz clic abajo:', 'de': '🏢 <b>Lieferdetails (Optional)</b>\\n\\nGeben Sie Gebäude-Code, Etage, usw. an.\\n\\nAndernfalls klicken Sie unten:'},
    'btn_skip_step': {'en': '⏭ Skip this step', 'es': '⏭ Saltar este paso', 'de': '⏭ Diesen Schritt überspringen'},
    'msg_my_orders': {'en': '📦 <b>My Orders</b>', 'es': '📦 <b>Mis Pedidos</b>', 'de': '📦 <b>Meine Bestellungen</b>'},
    'label_profile': {'en': '👤 Profile:', 'es': '👤 Perfil:', 'de': '👤 Profil:'},
    'label_wallet': {'en': '💰 Balance:', 'es': '💰 Saldo:', 'de': '💰 Guthaben:'},
    'label_loyalty': {'en': '🏆 Points:', 'es': '🏆 Puntos:', 'de': '🏆 Punkte:'},
    'msg_active_orders': {'en': '<b>🏃 Active Orders:</b>', 'es': '<b>🏃 Pedidos en curso:</b>', 'de': '<b>🏃 Aktive Bestellungen:</b>'},
    'label_taken': {'en': 'In delivery', 'es': 'En entrega', 'de': 'In Lieferung'},
    'label_pending': {'en': 'Pending', 'es': 'Pendiente', 'de': 'Ausstehend'},
    'btn_manage_order': {'en': '🔍 Manage #${o.id.slice(-5)}', 'es': '🔍 Gestionar #${o.id.slice(-5)}', 'de': '🔍 Verwalten #${o.id.slice(-5)}'},
    'msg_past_orders': {'en': '📋 <b>Past Orders:</b>', 'es': '📋 <b>Pedidos Anteriores:</b>', 'de': '📋 <b>Bisherige Bestellungen:</b>'},
    'label_delivered': {'en': '✅ Delivered', 'es': '✅ Entregado', 'de': '✅ Geliefert'},
    'label_cancelled': {'en': '❌ Cancelled', 'es': '❌ Anulado', 'de': '❌ Storniert'},
    'label_address': {'en': '📍 Address:', 'es': '📍 Dirección:', 'de': '📍 Adresse:'},
    'label_scheduled_for': {'en': '🕒 Scheduled for:', 'es': '🕒 Programado para:', 'de': '🕒 Geplant für:'},
    'label_delivery_asap': {'en': '🚀 Delivery: ASAP', 'es': '🚀 Entrega: ASAP', 'de': '🚀 Lieferung: ASAP'},
    'label_priority_option': {'en': '🚀 <b>Priority Option: +{fee}€</b>', 'es': '🚀 <b>Opción Prioritaria: +{fee}€</b>', 'de': '🚀 <b>Prioritäre Option: +{fee}€</b>'},
    'label_subtotal': {'en': '💰 Subtotal:', 'es': '💰 Subtotal:', 'de': '💰 Zwischensumme:'},
    'label_credit_discount': {'en': '🎁 Credit Discount:', 'es': '🎁 Descuento de Crédito:', 'de': '🎁 Guthabenrabatt:'},
    'label_total_to_pay': {'en': '💵 <b>TOTAL TO PAY: {total}€</b>', 'es': '💵 <b>TOTAL A PAGAR: {total}€</b>', 'de': '💵 <b>ZU ZAHLEN: {total}€</b>'},
    'btn_confirm_order_pm': {'en': '✅ Confirm ({label})', 'es': '✅ Confirmar ({label})', 'de': '✅ Bestätigen ({label})'},
    'label_ongoing_orders_btn': {'en': '📦 My ongoing orders', 'es': '📦 Mis pedidos en curso', 'de': '📦 Meine laufenden Bestellungen'},
    'msg_first_order_welcome': {'en': '👋 <b>First order!</b>\\nContact admin to validate: {contact}', 'es': '👋 <b>¡Primer pedido!</b>\\nContacta al admin: {contact}', 'de': '👋 <b>Erste Bestellung!</b>\\nKontaktiere Admin: {contact}'},
    'msg_live_tracking': {'en': '<b>Live tracking</b>\\n\\nTo let the client track your arrival:\\n\\n1. Share Live Location', 'es': '<b>Seguimiento en vivo</b>\\n\\nComparte tu ubicación en vivo', 'de': '<b>Live-Tracking</b>\\n\\nTeilen Sie Ihren Live-Standort'},
    'btn_available_label': {'en': '✅ Available', 'es': '✅ Disponible', 'de': '✅ Verfügbar'},
    'btn_unavailable_label': {'en': '😴 Unavailable', 'es': '😴 Indisponible', 'de': '😴 Nicht verfügbar'},
    'msg_quit_livreur_confirm_text': {'en': '⚠️ <b>Are you sure?</b>\\n\\nYou will no longer receive order alerts.', 'es': '⚠️ <b>¿Estás seguro?</b>\\n\\nYa no recibirás alertas de pedidos.', 'de': '⚠️ <b>Sind Sie sicher?</b>\\n\\nSie erhalten keine Bestellbenachrichtigungen mehr.'},
    'btn_quit_livreur_final_label': {'en': '✅ Yes, quit', 'es': '✅ Sí, salir', 'de': '✅ Ja, verlassen'},
    'msg_pos_updated_text': {'en': '📍 Sector updated: {city}', 'es': '📍 Sector actualizado: {city}', 'de': '📍 Sektor aktualisiert: {city}'},
    'msg_order_tracking': {'en': '📦 <b>Order Tracking #{orderId.slice(-5)}</b>', 'es': '📦 <b>Seguimiento #{orderId.slice(-5)}</b>', 'de': '📦 <b>Bestellverfolgung #{orderId.slice(-5)}</b>'},
    'label_status': {'en': '🔹 Status:', 'es': '🔹 Estado:', 'de': '🔹 Status:'},
    'label_product': {'en': '🛒 Product:', 'es': '🛒 Producto:', 'de': '🛒 Produkt:'},
    'label_livreur': {'en': '👤 Courier:', 'es': '👤 Repartidor:', 'de': '👤 Kurier:'},
    'btn_leave_review': {'en': '⭐ Leave a review', 'es': '⭐ Dejar una reseña', 'de': '⭐ Bewertung abgeben'},
    'btn_chat_livreur': {'en': '💬 Chat with courier', 'es': '💬 Hablar con el repartidor', 'de': '💬 Mit Kurier chatten'},
    'btn_back_orders': {'en': '◀️ Back to orders', 'es': '◀️ Volver a mis pedidos', 'de': '◀️ Zurück zu Bestellungen'},
    'label_admin_console': {'en': '🛠 <b>Telegram Management Console</b>', 'es': '🛠 <b>Consola de Gestión Telegram</b>', 'de': '🛠 <b>Telegram Verwaltungskonsole</b>'},
    'msg_admin_welcome': {'en': 'Welcome Administrator.', 'es': 'Bienvenido Administrador.', 'de': 'Willkommen Administrator.'},
    'label_total_users': {'en': 'Users:', 'es': 'Usuarios:', 'de': 'Benutzer:'},
    'label_total_ca': {'en': 'Sales:', 'es': 'Ventas:', 'de': 'Umsatz:'},
    'btn_admin_support': {'en': '💬 Support', 'es': '💬 Soporte', 'de': '💬 Support'},
    'btn_admin_orders': {'en': '📦 Orders', 'es': '📦 Pedidos', 'de': '📦 Bestellungen'},
    'btn_admin_users': {'en': '👥 Users', 'es': '👥 Usuarios', 'de': '👥 Benutzer'},
    'btn_admin_livreurs': {'en': '🚴 Couriers', 'es': '🚴 Repartidores', 'de': '🚴 Kuriere'},
    'btn_admin_stats': {'en': '📊 Statistics', 'es': '📊 Estadísticas', 'de': '📊 Statistiken'},
    'btn_admin_broadcast': {'en': '🔔 Broadcast', 'es': '🔔 Difusión', 'de': '🔔 Rundfunk'},
    'btn_admin_settings': {'en': '⚙️ Settings', 'es': '⚙️ Ajustes', 'de': '⚙️ Einstellungen'},
    'btn_admin_features': {'en': '✨ Bot Guide', 'es': '✨ Guía del Bot', 'de': '✨ Bot-Anleitung'},
    'btn_quit_console': {'en': '◀️ Quit Console', 'es': '◀️ Quitar consola', 'de': '◀️ Konsole verlassen'},
    'msg_support_sent': {'en': '💬 <b>Need an admin?</b>\\n\\nYour request has been forwarded.', 'es': '💬 <b>¿Necesitas un admin?</b>\\n\\nTu solicitud ha sido enviada.', 'de': '💬 <b>Brauchen Sie einen Admin?</b>\\n\\nIhre Anfrage wurde weitergeleitet.'},
    'btn_catalog_classic': {'en': 'CLASSIC CATALOG', 'es': 'CATÁLOGO CLÁSICO', 'de': 'KLASSISCHER KATALOG'},
    'btn_catalog_miniapp': {'en': '✨ MINI APP CATALOG ✨', 'es': '✨ CATÁLOGO MINI APP ✨', 'de': '✨ MINI APP KATALOG ✨'},
    'btn_livreur_menu': {'en': 'Courier', 'es': 'Repartidor', 'de': 'Kurier'},
    'btn_supplier_menu': {'en': '🏪 Supplier', 'es': '🏪 Proveedor', 'de': '🏪 Lieferant'},
    'label_not_defined': {'en': 'NOT DEFINED', 'es': 'NO DEFINIDO', 'de': 'NICHT DEFINIERT'},
    'label_available': {'en': 'AVAILABLE', 'es': 'DISPONIBLE', 'de': 'VERFÜGBAR'},
    'label_unavailable': {'en': 'UNAVAILABLE', 'es': 'NO DISPONIBLE', 'de': 'NICHT VERFÜGBAR'},
    'btn_livreur_miniapp': {'en': '✨ COURIER AREA (MINI APP) ✨', 'es': '✨ ÁREA DE REPARTIDOR (MINI APP) ✨', 'de': '✨ KURIER-BEREICH (MINI APP) ✨'},
    'btn_orders_available_label': {'en': '📦 Orders', 'es': '📦 Pedidos', 'de': '📦 Bestellungen'},
    'btn_planned_orders_label': {'en': '🗓 Scheduled', 'es': '🗓 Programados', 'de': '🗓 Geplant'},
    'btn_history_orders_label': {'en': '📈 History', 'es': '📈 Historial', 'de': '📈 Verlauf'},
    'btn_client_mode_label': {'en': '🛍 Client', 'es': '🛍 Cliente', 'de': '🛍 Kunde'},
    'btn_livreur_settings': {'en': '⚙️ Settings', 'es': '⚙️ Ajustes', 'de': '⚙️ Einstellungen'},
    'btn_active_deliveries_label': {'en': '🚚 MY ACTIVE DELIVERIES 🔥', 'es': '🚚 MIS ENTREGAS ACTIVAS 🔥', 'de': '🚚 MEINE AKTIVEN LIEFERUNGEN 🔥'},
    'msg_client_mode': {'en': '🛒 <b>Client Mode</b>\\n\\nYou can now order as a normal client.', 'es': '🛒 <b>Modo Cliente</b>\\n\\nAhora puedes pedir como un cliente normal.', 'de': '🛒 <b>Kundenmodus</b>\\n\\nSie können jetzt wie ein normaler Kunde bestellen.'},
    'btn_modify_address': {'en': '◀️ Modify address', 'es': '◀️ Modificar dirección', 'de': '◀️ Adresse ändern'},
    'btn_back_quick_menu': {'en': '◀️ Quick Menu', 'es': '◀️ Menú Rápido', 'de': '◀️ Schnellmenü'}
}

with open('/Users/dikenson/Desktop/Farmstegridy_bot/services/i18n.js', 'r', encoding='utf-8') as f:
    i18n_content = f.read()

# For each language, find its dictionary block in the source code and inject missing translations
for lang in ['en', 'es', 'de']:
    # We'll just append them at the end of each language block before the closing brace
    # Search for exactly this pattern `lang: {`
    pattern = re.compile(r'(' + lang + r':\s*\{)(.*?)(\n\s*\})', re.DOTALL)
    match = pattern.search(i18n_content)
    if match:
        existing_keys_text = match.group(2)
        new_keys = []
        for key in found_keys:
            if key not in translations_map:
                continue
            # If the key isn't already in the block
            if f"'{key}':" not in existing_keys_text and f'"{key}":' not in existing_keys_text:
                new_val = translations_map[key][lang].replace("'", "\\'")
                new_keys.append(f"        '{key}': '{new_val}'")
        
        if new_keys:
            replacement = match.group(1) + match.group(2) + ",\n" + ",\n".join(new_keys) + match.group(3)
            i18n_content = i18n_content[:match.start()] + replacement + i18n_content[match.end():]

with open('/Users/dikenson/Desktop/Farmstegridy_bot/services/i18n.js', 'w', encoding='utf-8') as f:
    f.write(i18n_content)
print("Updated i18n.js")

# Now update translations.js
with open('/Users/dikenson/Desktop/Farmstegridy_bot/web/js/translations.js', 'r', encoding='utf-8') as f:
    trans_content = f.read()

web_translations = {
    'nav_shop': {'fr': 'Boutique', 'en': 'Shop', 'es': 'Tienda', 'de': 'Shop'},
    'nav_tracking': {'fr': 'Suivi', 'en': 'Tracking', 'es': 'Seguimiento', 'de': 'Verfolgung'},
    'nav_profile': {'fr': 'Profil', 'en': 'Profile', 'es': 'Perfil', 'de': 'Profil'}
}

for lang in ['fr', 'en', 'es', 'de']:
    pattern = re.compile(r'(' + lang + r':\s*\{)(.*?)(\n\s*\})', re.DOTALL)
    match = pattern.search(trans_content)
    if match:
        existing_keys_text = match.group(2)
        new_keys = []
        for key, vals in web_translations.items():
            if f"'{key}':" not in existing_keys_text and f'"{key}":' not in existing_keys_text:
                new_val = vals[lang].replace("'", "\\'")
                new_keys.append(f"        '{key}': '{new_val}'")
        
        if new_keys:
            replacement = match.group(1) + match.group(2) + ",\n" + ",\n".join(new_keys) + match.group(3)
            trans_content = trans_content[:match.start()] + replacement + trans_content[match.end():]

# Add notranslate to data-i18n elements
notranslate_code = "        el.classList.add('notranslate');"
if "el.classList.add('notranslate');" not in trans_content:
    trans_content = trans_content.replace(
        "const key = el.getAttribute('data-i18n');",
        f"const key = el.getAttribute('data-i18n');\n{notranslate_code}"
    )

with open('/Users/dikenson/Desktop/Farmstegridy_bot/web/js/translations.js', 'w', encoding='utf-8') as f:
    f.write(trans_content)
print("Updated translations.js")
