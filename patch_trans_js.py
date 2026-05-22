import re

new_keys = {
    'delivery_to': {'fr': 'Livraison à :', 'en': 'Delivery to:', 'es': 'Entrega a:', 'de': 'Lieferung nach:'},
    'front_page': {'fr': 'À LA UNE ⚡', 'en': 'FRONT PAGE ⚡', 'es': 'PORTADA ⚡', 'de': 'STARTSEITE ⚡'},
    'featured_products': {'fr': 'PRODUITS EN VEDETTE', 'en': 'FEATURED PRODUCTS', 'es': 'PRODUCTOS DESTACADOS', 'de': 'EMPFOHLENE PRODUKTE'},
    'search': {'fr': 'Rechercher...', 'en': 'Search...', 'es': 'Buscar...', 'de': 'Suchen...'},
    'tracking_help': {'fr': 'SUIVI & AIDE', 'en': 'TRACKING & HELP', 'es': 'SEGUIMIENTO Y AYUDA', 'de': 'VERFOLGUNG & HILFE'},
    'need_help': {'fr': "Besoin d'aide avec une commande ? Discutez avec nous !", 'en': 'Need help with an order? Chat with us!', 'es': '¿Necesitas ayuda con un pedido? ¡Habla con nosotros!', 'de': 'Benötigen Sie Hilfe bei einer Bestellung? Chatten Sie mit uns!'},
    'your_account': {'fr': 'VOTRE COMPTE', 'en': 'YOUR ACCOUNT', 'es': 'TU CUENTA', 'de': 'IHR KONTO'},
    'wallet': {'fr': 'Portefeuille', 'en': 'Wallet', 'es': 'Billetera', 'de': 'Brieftasche'},
    'avail_balance': {'fr': 'Solde disponible', 'en': 'Available balance', 'es': 'Saldo disponible', 'de': 'Verfügbares Guthaben'},
    'referral': {'fr': 'Parrainage', 'en': 'Referral', 'es': 'Referencia', 'de': 'Empfehlung'},
    'earn_credits': {'fr': 'Gagnez des crédits', 'en': 'Earn credits', 'es': 'Gana créditos', 'de': 'Credits verdienen'},
    'my_favorites': {'fr': 'Mes Favoris', 'en': 'My Favorites', 'es': 'Mis Favoritos', 'de': 'Meine Favoriten'},
    'find_favorites': {'fr': 'Retrouver mes produits préférés', 'en': 'Find my favorite products', 'es': 'Encuentra mis productos favoritos', 'de': 'Finden Sie meine Lieblingsprodukte'},
    'my_reviews': {'fr': 'Mes Avis', 'en': 'My Reviews', 'es': 'Mis Reseñas', 'de': 'Meine Bewertungen'},
    'manage_reviews': {'fr': 'Voir et gérer mes avis', 'en': 'View and manage my reviews', 'es': 'Ver y gestionar mis reseñas', 'de': 'Meine Bewertungen ansehen'},
    'contact_admin': {'fr': "Contacter l'Admin", 'en': 'Contact Admin', 'es': 'Contactar Administrador', 'de': 'Admin kontaktieren'},
    'telegram_link': {'fr': 'Lien direct Telegram', 'en': 'Direct Telegram link', 'es': 'Enlace directo a Telegram', 'de': 'Direkter Telegram-Link'},
    'opportunities': {'fr': 'OPPORTUNITÉS', 'en': 'OPPORTUNITIES', 'es': 'OPORTUNIDADES', 'de': 'MÖGLICHKEITEN'},
    'become_courier': {'fr': 'Devenir Livreur', 'en': 'Become Courier', 'es': 'Hacerse Repartidor', 'de': 'Kurier werden'},
    'join_team': {'fr': "Rejoignez l'équipe", 'en': 'Join the team', 'es': 'Únete al equipo', 'de': 'Kommen Sie ins Team'},
    'delete_account': {'fr': ' SUPPRIMER MON COMPTE', 'en': ' DELETE MY ACCOUNT', 'es': ' ELIMINAR MI CUENTA', 'de': ' MEIN KONTO LÖSCHEN'},
    'checkout_btn': {'fr': 'FINALISER LA COMMANDE', 'en': 'CHECKOUT', 'es': 'FINALIZAR COMPRA', 'de': 'ZUR KASSE'},
    'product': {'fr': 'Produit', 'en': 'Product', 'es': 'Producto', 'de': 'Produkt'},
    'choose_qty': {'fr': 'Choisissez la quantité :', 'en': 'Choose quantity:', 'es': 'Elige cantidad:', 'de': 'Menge wählen:'},
    'add_cart': {'fr': 'AJOUTER AU PANIER', 'en': 'ADD TO CART', 'es': 'AÑADIR AL CARRITO', 'de': 'IN DEN WARENKORB'},
    'close': {'fr': 'FERMER', 'en': 'CLOSE', 'es': 'CERRAR', 'de': 'SCHLIESSEN'},
    'product_details': {'fr': 'DÉTAILS DU PRODUIT', 'en': 'PRODUCT DETAILS', 'es': 'DETALLES DEL PRODUCTO', 'de': 'PRODUKTDETAILS'},
    'available_formats': {'fr': 'FORMATS DISPONIBLES 📦', 'en': 'AVAILABLE FORMATS 📦', 'es': 'FORMATOS DISPONIBLES 📦', 'de': 'VERFÜGBARE FORMATE 📦'},
    'customer_reviews': {'fr': 'AVIS CLIENTS ⭐', 'en': 'CUSTOMER REVIEWS ⭐', 'es': 'RESEÑAS DE CLIENTES ⭐', 'de': 'KUNDENBEWERTUNGEN ⭐'},
    'leave_review': {'fr': 'LAISSER UN AVIS', 'en': 'LEAVE A REVIEW', 'es': 'DEJAR UNA RESEÑA', 'de': 'BEWERTUNG HINTERLASSEN'},
    'general_support': {'fr': 'SUPPORT GÉNÉRAL', 'en': 'GENERAL SUPPORT', 'es': 'SOPORTE GENERAL', 'de': 'ALLGEMEINER SUPPORT'},
    'recent_orders': {'fr': 'COMMANDES RÉCENTES', 'en': 'RECENT ORDERS', 'es': 'PEDIDOS RECIENTES', 'de': 'LETZTE BESTELLUNGEN'},
    'team_chat': {'fr': "DISCUSSION AVEC L'ÉQUIPE", 'en': 'TEAM CHAT', 'es': 'CHAT DEL EQUIPO', 'de': 'TEAM CHAT'},
    'your_message': {'fr': 'Votre message...', 'en': 'Your message...', 'es': 'Tu mensaje...', 'de': 'Ihre Nachricht...'},
    'notifications': {'fr': 'NOTIFICATIONS', 'en': 'NOTIFICATIONS', 'es': 'NOTIFICACIONES', 'de': 'BENACHRICHTIGUNGEN'},
    'summary': {'fr': 'RECAPITULATIF', 'en': 'SUMMARY', 'es': 'RESUMEN', 'de': 'ZUSAMMENFASSUNG'},
    'total_caps': {'fr': 'TOTAL :', 'en': 'TOTAL:', 'es': 'TOTAL:', 'de': 'GESAMT:'},
    'validate_order': {'fr': 'VALIDER LA COMMANDE', 'en': 'VALIDATE ORDER', 'es': 'VALIDAR PEDIDO', 'de': 'BESTELLUNG BESTÄTIGEN'},
    'back_caps': {'fr': 'RETOUR', 'en': 'BACK', 'es': 'VOLVER', 'de': 'ZURÜCK'},
    'network_error': {'fr': 'Erreur réseau', 'en': 'Network error', 'es': 'Error de red', 'de': 'Netzwerkfehler'},
    'load_error': {'fr': 'Erreur lors du chargement', 'en': 'Loading error', 'es': 'Error al cargar', 'de': 'Fehler beim Laden'},
    'all': {'fr': 'Tous', 'en': 'All', 'es': 'Todos', 'de': 'Alle'},
    'favorites_cat': {'fr': 'FAVORIS ❤️', 'en': 'FAVORITES ❤️', 'es': 'FAVORITOS ❤️', 'de': 'FAVORITEN ❤️'},
    'no_product': {'fr': 'Aucun produit disponible.', 'en': 'No product available.', 'es': 'Ningún producto disponible.', 'de': 'Kein Produkt verfügbar.'},
    'loading': {'fr': 'Chargement...', 'en': 'Loading...', 'es': 'Cargando...', 'de': 'Laden...'},
    'courier': {'fr': 'LIVREUR', 'en': 'COURIER', 'es': 'REPARTIDOR', 'de': 'KURIER'},
    'unavailable': {'fr': 'INDISPONIBLE', 'en': 'UNAVAILABLE', 'es': 'NO DISPONIBLE', 'de': 'NICHT VERFÜGBAR'},
    'in_delivery_fire': {'fr': 'En livraison 🔥', 'en': 'In delivery 🔥', 'es': 'En entrega 🔥', 'de': 'In Lieferung 🔥'},
    'orders_available_box': {'fr': 'Commandes disponibles 📦', 'en': 'Available orders 📦', 'es': 'Pedidos disponibles 📦', 'de': 'Verfügbare Bestellungen 📦'},
    'active_chats': {'fr': 'Discussions actives 💬', 'en': 'Active chats 💬', 'es': 'Chats activos 💬', 'de': 'Aktive Chats 💬'},
    'history_cumulative': {'fr': 'Mon historique cumulé 📈', 'en': 'My cumulative history 📈', 'es': 'Mi historial acumulado 📈', 'de': 'Mein kumulierter Verlauf 📈'},
    'courses': {'fr': 'COURSES', 'en': 'DELIVERIES', 'es': 'ENTREGAS', 'de': 'LIEFERUNGEN'},
    'chat': {'fr': 'CHAT', 'en': 'CHAT', 'es': 'CHAT', 'de': 'CHAT'},
    'history_caps': {'fr': 'HISTORIQUE', 'en': 'HISTORY', 'es': 'HISTORIAL', 'de': 'VERLAUF'},
    'loading_console': {'fr': 'CHARGEMENT CONSOLE...', 'en': 'LOADING CONSOLE...', 'es': 'CARGANDO CONSOLA...', 'de': 'KONSOLE LADEN...'},
    'available_caps': {'fr': 'DISPONIBLE', 'en': 'AVAILABLE', 'es': 'DISPONIBLE', 'de': 'VERFÜGBAR'},
    'unavailable_caps': {'fr': 'INDISPONIBLE', 'en': 'UNAVAILABLE', 'es': 'NO DISPONIBLE', 'de': 'NICHT VERFÜGBAR'},
    'open_from_telegram': {'fr': 'Veuillez ouvrir cette application directement depuis Telegram.', 'en': 'Please open this app directly from Telegram.', 'es': 'Por favor, abra esta aplicación directamente desde Telegram.', 'de': 'Bitte öffnen Sie diese App direkt aus Telegram.'},
    'courier_access_only': {'fr': 'Accès strictement réservé aux livreurs certifiés.', 'en': 'Access strictly reserved for certified couriers.', 'es': 'Acceso reservado estrictamente para repartidores certificados.', 'de': 'Zugang streng reserviert für zertifizierte Kuriere.'},
    'no_active_delivery': {'fr': 'Aucune livraison en cours.', 'en': 'No active delivery.', 'es': 'Ninguna entrega en curso.', 'de': 'Keine aktive Lieferung.'},
    'msg_to_client': {'fr': 'Votre message au client...', 'en': 'Your message to client...', 'es': 'Tu mensaje al cliente...', 'de': 'Ihre Nachricht an den Kunden...'},
    'last_exchange': {'fr': 'Dernier échange ', 'en': 'Last exchange ', 'es': 'Último intercambio ', 'de': 'Letzter Austausch '},
    'you': {'fr': 'Vous', 'en': 'You', 'es': 'Tú', 'de': 'Sie'},
    'client': {'fr': 'Client', 'en': 'Client', 'es': 'Cliente', 'de': 'Kunde'},
    'chat_started': {'fr': 'Discussion entamée ', 'en': 'Chat started ', 'es': 'Chat iniciado ', 'de': 'Chat gestartet '},
    'client_approach': {'fr': 'APPROCHE CLIENT :', 'en': 'CLIENT APPROACH:', 'es': 'APROXIMACIÓN AL CLIENTE:', 'de': 'KUNDENANFAHRT:'},
    'mark_delivered': {'fr': 'MARQUER LIVRÉ', 'en': 'MARK DELIVERED', 'es': 'MARCAR ENTREGADO', 'de': 'ALS GELIEFERT MARKIEREN'},
    'navigate': {'fr': 'NAVIGUER', 'en': 'NAVIGATE', 'es': 'NAVEGAR', 'de': 'NAVIGIEREN'},
    'chat_btn': {'fr': 'CHAT ', 'en': 'CHAT ', 'es': 'CHAT ', 'de': 'CHAT '},
    'put_back': {'fr': 'REMETTRE', 'en': 'PUT BACK', 'es': 'DEVOLVER', 'de': 'ZURÜCKLEGEN'},
    'cancel_caps': {'fr': 'ANNULER', 'en': 'CANCEL', 'es': 'CANCELAR', 'de': 'ABBRECHEN'},
    'anonymous_msg': {'fr': 'MESSAGERIE ANONYME :', 'en': 'ANONYMOUS MESSAGING:', 'es': 'MENSAJERÍA ANÓNIMA:', 'de': 'ANONYMES MESSAGING:'},
    'send_caps': {'fr': 'ENVOYER', 'en': 'SEND', 'es': 'ENVIAR', 'de': 'SENDEN'},
    'anonymous_hint': {'fr': 'Le client verra ce message sans connaître votre numéro.', 'en': 'The client will see this without knowing your number.', 'es': 'El cliente verá esto sin saber tu número.', 'de': 'Der Kunde wird dies sehen, ohne Ihre Nummer zu kennen.'}
}

filepath = '/Users/dikenson/Desktop/Farmstegridy_bot/web/js/translations.js'

with open(filepath, 'r', encoding='utf-8') as f:
    trans_content = f.read()

for lang in ['fr', 'en', 'es', 'de']:
    pattern = re.compile(r'(' + lang + r':\s*\{)(.*?)(\n\s*\})', re.DOTALL)
    match = pattern.search(trans_content)
    if match:
        existing_keys_text = match.group(2)
        added_keys = []
        for key, vals in new_keys.items():
            if f"'{key}':" not in existing_keys_text and f'"{key}":' not in existing_keys_text:
                new_val = vals[lang].replace("'", "\\'")
                added_keys.append(f"        '{key}': '{new_val}'")
        
        if added_keys:
            replacement = match.group(1) + match.group(2) + ",\n" + ",\n".join(added_keys) + match.group(3)
            trans_content = trans_content[:match.start()] + replacement + trans_content[match.end():]

# Ensure we process data-i18n-placeholder
placeholder_code = """
    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
        const key = el.getAttribute('data-i18n-placeholder');
        if (translations[currentLang] && translations[currentLang][key]) {
            el.setAttribute('placeholder', translations[currentLang][key]);
            el.classList.add('notranslate');
        } else if (translations['fr'] && translations['fr'][key]) {
            el.setAttribute('placeholder', translations['fr'][key]);
            el.classList.add('notranslate');
        }
    });
"""

if "data-i18n-placeholder" not in trans_content:
    # Insert it right before the observer or at the end of the init block
    # A safe place is just after the data-i18n loop
    trans_content = trans_content.replace(
        "document.querySelectorAll('[data-i18n]').forEach(el => {",
        placeholder_code + "\n    document.querySelectorAll('[data-i18n]').forEach(el => {"
    )

with open(filepath, 'w', encoding='utf-8') as f:
    f.write(trans_content)
    
print("Updated translations.js with all new keys and placeholders.")
