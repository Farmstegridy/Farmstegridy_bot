import os
import re

def replace_in_file(filepath, replacements, js_replacements):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    for old, new in replacements.items():
        content = content.replace(old, new)
        
    for old, new in js_replacements.items():
        content = content.replace(old, new)

    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(content)

replacements_catalog = {
    '>Livraison à :<': '><span data-i18n="delivery_to">Livraison à :</span><',
    '>À LA UNE ⚡<': '><span data-i18n="front_page">À LA UNE ⚡</span><',
    '>PRODUITS EN VEDETTE<': '><span data-i18n="featured_products">PRODUITS EN VEDETTE</span><',
    'placeholder="Rechercher..."': 'placeholder="Rechercher..." data-i18n-placeholder="search"',
    '>SUIVI & AIDE<': '><span data-i18n="tracking_help">SUIVI & AIDE</span><',
    ">Besoin d'aide avec une commande ? Discutez avec nous !<": '><span data-i18n="need_help">Besoin d\'aide avec une commande ? Discutez avec nous !</span><',
    '>VOTRE COMPTE<': '><span data-i18n="your_account">VOTRE COMPTE</span><',
    '>Portefeuille<': '><span data-i18n="wallet">Portefeuille</span><',
    '>Solde disponible<': '><span data-i18n="avail_balance">Solde disponible</span><',
    '>Parrainage<': '><span data-i18n="referral">Parrainage</span><',
    '>Gagnez des crédits<': '><span data-i18n="earn_credits">Gagnez des crédits</span><',
    '>Mes Favoris<': '><span data-i18n="my_favorites">Mes Favoris</span><',
    '>Retrouver mes produits préférés<': '><span data-i18n="find_favorites">Retrouver mes produits préférés</span><',
    '>Mes Avis<': '><span data-i18n="my_reviews">Mes Avis</span><',
    '>Voir et gérer mes avis<': '><span data-i18n="manage_reviews">Voir et gérer mes avis</span><',
    ">Contacter l'Admin<": "><span data-i18n=\"contact_admin\">Contacter l'Admin</span><",
    '>Lien direct Telegram<': '><span data-i18n="telegram_link">Lien direct Telegram</span><',
    '>OPPORTUNITÉS<': '><span data-i18n="opportunities">OPPORTUNITÉS</span><',
    '>Devenir Livreur<': '><span data-i18n="become_courier">Devenir Livreur</span><',
    ">Rejoignez l'équipe<": "><span data-i18n=\"join_team\">Rejoignez l'équipe</span><",
    '> SUPPRIMER MON COMPTE<': '><span data-i18n="delete_account"> SUPPRIMER MON COMPTE</span><',
    '>FINALISER LA COMMANDE<': '><span data-i18n="checkout_btn">FINALISER LA COMMANDE</span><',
    '>Produit<': '><span data-i18n="product">Produit</span><',
    '>Choisissez la quantité :<': '><span data-i18n="choose_qty">Choisissez la quantité :</span><',
    '>AJOUTER AU PANIER<': '><span data-i18n="add_cart">AJOUTER AU PANIER</span><',
    '>FERMER<': '><span data-i18n="close">FERMER</span><',
    '>DÉTAILS DU PRODUIT<': '><span data-i18n="product_details">DÉTAILS DU PRODUIT</span><',
    '>FORMATS DISPONIBLES 📦<': '><span data-i18n="available_formats">FORMATS DISPONIBLES 📦</span><',
    '>AVIS CLIENTS ⭐<': '><span data-i18n="customer_reviews">AVIS CLIENTS ⭐</span><',
    '>LAISSER UN AVIS<': '><span data-i18n="leave_review">LAISSER UN AVIS</span><',
    '>SUPPORT GÉNÉRAL<': '><span data-i18n="general_support">SUPPORT GÉNÉRAL</span><',
    '>COMMANDES RÉCENTES<': '><span data-i18n="recent_orders">COMMANDES RÉCENTES</span><',
    ">DISCUSSION AVEC L'ÉQUIPE<": "><span data-i18n=\"team_chat\">DISCUSSION AVEC L'ÉQUIPE</span><",
    'placeholder="Votre message..."': 'placeholder="Votre message..." data-i18n-placeholder="your_message"',
    '>NOTIFICATIONS<': '><span data-i18n="notifications">NOTIFICATIONS</span><',
    '>RECAPITULATIF<': '><span data-i18n="summary">RECAPITULATIF</span><',
    '>TOTAL :<': '><span data-i18n="total_caps">TOTAL :</span><',
    '>VALIDER LA COMMANDE<': '><span data-i18n="validate_order">VALIDER LA COMMANDE</span><',
    '>RETOUR<': '><span data-i18n="back_caps">RETOUR</span><'
}

js_replacements_catalog = {
    "'Erreur réseau'": "t('network_error', {default: 'Erreur réseau'})",
    "'Erreur lors du chargement'": "t('load_error', {default: 'Erreur lors du chargement'})",
    "'Tous'": "t('all', {default: 'Tous'})",
    "'FAVORIS ❤️'": "t('favorites_cat', {default: 'FAVORIS ❤️'})",
    "'Aucun produit disponible.'": "t('no_product', {default: 'Aucun produit disponible.'})",
    "'Chargement...'": "t('loading', {default: 'Chargement...'})"
}

replacements_livreur = {
    '>LIVREUR<': '><span data-i18n="courier">LIVREUR</span><',
    '>INDISPONIBLE<': '><span data-i18n="unavailable">INDISPONIBLE</span><',
    '>En livraison 🔥<': '><span data-i18n="in_delivery_fire">En livraison 🔥</span><',
    '>Commandes disponibles 📦<': '><span data-i18n="orders_available_box">Commandes disponibles 📦</span><',
    '>Discussions actives 💬<': '><span data-i18n="active_chats">Discussions actives 💬</span><',
    '>Mon historique cumulé 📈<': '><span data-i18n="history_cumulative">Mon historique cumulé 📈</span><',
    '>COURSES<': '><span data-i18n="courses">COURSES</span><',
    '>CHAT<': '><span data-i18n="chat">CHAT</span><',
    '>HISTORIQUE<': '><span data-i18n="history_caps">HISTORIQUE</span><',
    '>CHARGEMENT CONSOLE...<': '><span data-i18n="loading_console">CHARGEMENT CONSOLE...</span><'
}

js_replacements_livreur = {
    "text.innerText = 'DISPONIBLE';": "text.innerText = t('available_caps', {default: 'DISPONIBLE'});",
    "text.innerText = 'INDISPONIBLE';": "text.innerText = t('unavailable_caps', {default: 'INDISPONIBLE'});",
    "'Veuillez ouvrir cette application directement depuis Telegram.'": "t('open_from_telegram', {default: 'Veuillez ouvrir cette application directement depuis Telegram.'})",
    "'Accès strictement réservé aux livreurs certifiés.'": "t('courier_access_only', {default: 'Accès strictement réservé aux livreurs certifiés.'})",
    "'Aucune livraison en cours.'": "t('no_active_delivery', {default: 'Aucune livraison en cours.'})",
    "placeholder=\"Votre message au client...\"": "placeholder=\"Votre message au client...\" data-i18n-placeholder=\"msg_to_client\"",
    "'Dernier échange '": "t('last_exchange', {default: 'Dernier échange '})",
    "'Vous'": "t('you', {default: 'Vous'})",
    "'Client'": "t('client', {default: 'Client'})",
    "'Discussion entamée '": "t('chat_started', {default: 'Discussion entamée '})",
    "'APPROCHE CLIENT :'": "t('client_approach', {default: 'APPROCHE CLIENT :'})",
    "'MARQUER LIVRÉ'": "t('mark_delivered', {default: 'MARQUER LIVRÉ'})",
    "'NAVIGUER'": "t('navigate', {default: 'NAVIGUER'})",
    "'CHAT '": "t('chat_btn', {default: 'CHAT '})",
    "'REMETTRE'": "t('put_back', {default: 'REMETTRE'})",
    "'ANNULER'": "t('cancel_caps', {default: 'ANNULER'})",
    "'MESSAGERIE ANONYME :'": "t('anonymous_msg', {default: 'MESSAGERIE ANONYME :'})",
    "'ENVOYER'": "t('send_caps', {default: 'ENVOYER'})",
    "'Le client verra ce message sans connaître votre numéro.'": "t('anonymous_hint', {default: 'Le client verra ce message sans connaître votre numéro.'})"
}

replace_in_file('/Users/dikenson/Desktop/Farmstegridy_bot/web/views/catalog.html', replacements_catalog, js_replacements_catalog)
replace_in_file('/Users/dikenson/Desktop/Farmstegridy_bot/web/views/livreur.html', replacements_livreur, js_replacements_livreur)

print("Applied HTML replacements.")
