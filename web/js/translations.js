const translations = {
    fr: {
        'cart': 'Panier',
        'catalog': 'Catalogue',
        'search': 'Rechercher...',
        'empty_catalog': 'Aucun produit disponible pour le moment.',
        'add_to_cart': 'Ajouter au panier',
        'checkout': 'Passer la commande',
        'total': 'Total',
        'loading': 'Chargement...',
        'error': 'Erreur',
        'success': 'Succès',
        'orders': 'Mes Commandes',
        'support': 'Support',
        'address_title': 'Adresse de livraison',
        'confirm_address': 'Confirmer l\\'adresse',
        'login': 'Se connecter',
        'dashboard': 'Tableau de bord',
        'settings': 'Paramètres',
        'back': 'Retour',
        'cancel': 'Annuler',
        'confirm': 'Confirmer',
        'yes': 'Oui',
        'no': 'Non',
        'delivery': 'Livraison',
        'pickup': 'Retrait',
        'livreur': 'Livreur',
        'status': 'Statut',
        'available': 'Disponible',
        'unavailable': 'Indisponible',
        'history': 'Historique',
        'my_shop': 'Ma Boutique'
    },
    en: {
        'cart': 'Cart',
        'catalog': 'Catalog',
        'search': 'Search...',
        'empty_catalog': 'No products available at the moment.',
        'add_to_cart': 'Add to cart',
        'checkout': 'Checkout',
        'total': 'Total',
        'loading': 'Loading...',
        'error': 'Error',
        'success': 'Success',
        'orders': 'My Orders',
        'support': 'Support',
        'address_title': 'Delivery Address',
        'confirm_address': 'Confirm Address',
        'login': 'Login',
        'dashboard': 'Dashboard',
        'settings': 'Settings',
        'back': 'Back',
        'cancel': 'Cancel',
        'confirm': 'Confirm',
        'yes': 'Yes',
        'no': 'No',
        'delivery': 'Delivery',
        'pickup': 'Pickup',
        'livreur': 'Courier',
        'status': 'Status',
        'available': 'Available',
        'unavailable': 'Unavailable',
        'history': 'History',
        'my_shop': 'My Shop'
    },
    es: {
        'cart': 'Carrito',
        'catalog': 'Catálogo',
        'search': 'Buscar...',
        'empty_catalog': 'No hay productos disponibles por el momento.',
        'add_to_cart': 'Añadir al carrito',
        'checkout': 'Hacer pedido',
        'total': 'Total',
        'loading': 'Cargando...',
        'error': 'Error',
        'success': 'Éxito',
        'orders': 'Mis Pedidos',
        'support': 'Soporte',
        'address_title': 'Dirección de entrega',
        'confirm_address': 'Confirmar Dirección',
        'login': 'Iniciar sesión',
        'dashboard': 'Panel',
        'settings': 'Ajustes',
        'back': 'Volver',
        'cancel': 'Cancelar',
        'confirm': 'Confirmar',
        'yes': 'Sí',
        'no': 'No',
        'delivery': 'Entrega',
        'pickup': 'Recogida',
        'livreur': 'Repartidor',
        'status': 'Estado',
        'available': 'Disponible',
        'unavailable': 'No disponible',
        'history': 'Historial',
        'my_shop': 'Mi Tienda'
    },
    de: {
        'cart': 'Warenkorb',
        'catalog': 'Katalog',
        'search': 'Suchen...',
        'empty_catalog': 'Derzeit keine Produkte verfügbar.',
        'add_to_cart': 'In den Warenkorb',
        'checkout': 'Zur Kasse',
        'total': 'Gesamt',
        'loading': 'Wird geladen...',
        'error': 'Fehler',
        'success': 'Erfolg',
        'orders': 'Meine Bestellungen',
        'support': 'Support',
        'address_title': 'Lieferadresse',
        'confirm_address': 'Adresse bestätigen',
        'login': 'Anmelden',
        'dashboard': 'Dashboard',
        'settings': 'Einstellungen',
        'back': 'Zurück',
        'cancel': 'Abbrechen',
        'confirm': 'Bestätigen',
        'yes': 'Ja',
        'no': 'Nein',
        'delivery': 'Lieferung',
        'pickup': 'Abholung',
        'livreur': 'Kurier',
        'status': 'Status',
        'available': 'Verfügbar',
        'unavailable': 'Nicht verfügbar',
        'history': 'Verlauf',
        'my_shop': 'Mein Shop'
    }
};

let currentLang = 'fr';

function initTranslations() {
    // Determine language from URL
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.has('lang')) {
        currentLang = urlParams.get('lang');
    } else if (window.Telegram && Telegram.WebApp && Telegram.WebApp.initDataUnsafe && Telegram.WebApp.initDataUnsafe.user) {
        currentLang = Telegram.WebApp.initDataUnsafe.user.language_code || 'fr';
    }

    if (!translations[currentLang]) {
        currentLang = 'fr';
    }

    // Apply translations to DOM
    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        if (translations[currentLang] && translations[currentLang][key]) {
            if (el.tagName === 'INPUT' && el.type === 'text') {
                el.placeholder = translations[currentLang][key];
            } else {
                el.innerText = translations[currentLang][key];
            }
        }
    });
}

function t(key, variables = {}) {
    let text = (translations[currentLang] && translations[currentLang][key]) ? translations[currentLang][key] : (translations['fr'][key] || key);
    for (const [k, v] of Object.entries(variables)) {
        text = text.replace(new RegExp(`{${k}}`, 'g'), v);
    }
    return text;
}

// Auto-init on load if in browser environment
if (typeof window !== 'undefined') {
    document.addEventListener('DOMContentLoaded', initTranslations);
}
