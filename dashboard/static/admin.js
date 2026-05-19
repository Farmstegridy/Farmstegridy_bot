let jwtToken = localStorage.getItem('adminToken');
let currentView = 'stats';
let charts = {};

// --- Initialization ---
document.addEventListener('DOMContentLoaded', () => {
    if (!jwtToken) {
        showLogin();
    } else {
        initDashboard();
    }

    // Switch view listeners
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', () => {
            switchView(item.dataset.view);
        });
    });
});

function showLogin() {
    document.getElementById('loginOverlay').style.display = 'flex';
}

async function login() {
    const password = document.getElementById('adminPassword').value;
    try {
        const res = await fetch('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password })
        });
        const data = await res.json();
        if (data.token) {
            jwtToken = data.token;
            localStorage.setItem('adminToken', jwtToken);
            document.getElementById('loginOverlay').style.display = 'none';
            initDashboard();
        } else {
            document.getElementById('loginError').textContent = data.error || 'Erreur inconnue';
        }
    } catch (e) {
        document.getElementById('loginError').textContent = 'Connexion impossible';
    }
}

function logout() {
    localStorage.removeItem('adminToken');
    window.location.reload();
}

async function initDashboard() {
    await refreshData();
    // Auto-refresh every 30s
    setInterval(refreshData, 30000);
}

async function refreshData() {
    await fetchStats();
    await fetchOrders();
    await fetchUsers();
    await fetchProducts();
    // fetchSuppliers(); // Disabled Bronze
    // fetchReviews(); // Disabled Bronze
    await fetchSettings();
}

async function fetchStats() {
    const data = await apiRequest('/api/stats');
    if (!data) return;

    document.getElementById('statUsers').textContent = data.totalUsers;
    document.getElementById('statOrders').textContent = data.totalOrders;
    document.getElementById('statActive').textContent = data.active24h;

    // renderOrdersChart(data.dailyStats); // Disabled Bronze
}

function switchView(viewName) {
    currentView = viewName;
    document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
    const targetView = document.getElementById(viewName + 'View');
    if (targetView) targetView.classList.remove('hidden');

    document.querySelectorAll('.nav-item').forEach(i => {
        i.classList.remove('active');
        if (i.dataset.view === viewName) i.classList.add('active');
    });

    const titles = {
        stats: 'Tableau de bord',
        orders: 'Gestion des Commandes',
        users: 'Utilisateurs',
        products: 'Catalogue Produits',
        broadcast: 'Diffusion & Annonces',
        settings: 'Configuration du Bot'
    };
    document.getElementById('viewTitle').textContent = titles[viewName] || 'Admin';
}

async function apiRequest(url, options = {}) {
    if (!options.headers) options.headers = {};
    options.headers['Authorization'] = `Bearer ${jwtToken}`;
    
    try {
        const res = await fetch(url, options);
        if (res.status === 401) logout();
        return await res.json();
    } catch (e) {
        console.error('API Error:', e);
        return null;
    }
}

async function fetchOrders() {
    const data = await apiRequest('/api/orders');
    if (!data) return;
    renderOrders(data);
}

function renderOrders(orders) {
    const tbody = document.querySelector('#ordersTable tbody');
    if (!tbody) return;
    tbody.innerHTML = orders.map(o => `
        <tr>
            <td>${o.user_name || o.chat_id}</td>
            <td>${o.summary}</td>
            <td>${o.total}€</td>
            <td><span class="status-badge ${o.status}">${o.status}</span></td>
            <td>${new Date(o.created_at).toLocaleString()}</td>
            <td>
                <button onclick="updateOrderStatus('${o.id}', 'delivering')">Livrer</button>
                <button onclick="updateOrderStatus('${o.id}', 'completed')">Terminer</button>
            </td>
        </tr>
    `).join('');
}

async function updateOrderStatus(id, status) {
    await apiRequest(`/api/orders/${id}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status })
    });
    refreshData();
}

async function fetchUsers() {
    const data = await apiRequest('/api/users');
    if (!data) return;
    renderUsers(data);
}

function renderUsers(users) {
    const tbody = document.querySelector('#usersTable tbody');
    if (!tbody) return;
    tbody.innerHTML = users.map(u => `
        <tr>
            <td>${u.first_name || 'Inconnu'}</td>
            <td>${u.chat_id}</td>
            <td>${new Date(u.created_at).toLocaleDateString()}</td>
            <td>${u.total_orders || 0}</td>
            <td><span class="status-badge ${u.status}">${u.status}</span></td>
            <td>
                ${u.status === 'pending' ? `<button onclick="approveUser('${u.chat_id}')">Approuver</button>` : ''}
                <button onclick="banUser('${u.chat_id}')">Bannir</button>
            </td>
        </tr>
    `).join('');
}

async function approveUser(id) {
    await apiRequest(`/api/users/${id}/approve`, { method: 'POST' });
    refreshData();
}

async function banUser(id) {
    if (confirm('Bannir cet utilisateur ?')) {
        await apiRequest(`/api/users/${id}/ban`, { method: 'POST' });
        refreshData();
    }
}

async function fetchProducts() {
    const data = await apiRequest('/api/products');
    if (!data) return;
    renderProducts(data);
}

function renderProducts(products) {
    const grid = document.getElementById('productsList');
    if (!grid) return;
    grid.innerHTML = products.map(p => `
        <div class="product-card">
            <img src="${p.image_url || '/public/placeholder.png'}" alt="${p.name}">
            <div class="product-info">
                <h4>${p.name}</h4>
                <p class="category">${p.category}</p>
                <p class="price">${p.price}€</p>
                <div class="actions">
                    <button class="edit-btn" onclick='editProduct(${JSON.stringify(p)})'>Modifier</button>
                    <button class="delete-btn" onclick="deleteProduct('${p.id}')">Suppr.</button>
                </div>
            </div>
        </div>
    `).join('');
}

function openProductModal() {
    document.getElementById('productModalTitle').textContent = 'Ajouter un produit';
    document.getElementById('productId').value = '';
    document.getElementById('pName').value = '';
    document.getElementById('pCategory').value = '';
    document.getElementById('pPrice').value = '';
    document.getElementById('pImage').value = '';
    document.getElementById('pDesc').value = '';
    document.getElementById('productModal').style.display = 'flex';
}

function editProduct(p) {
    document.getElementById('productModalTitle').textContent = 'Modifier le produit';
    document.getElementById('productId').value = p.id;
    document.getElementById('pName').value = p.name;
    document.getElementById('pCategory').value = p.category;
    document.getElementById('pPrice').value = p.price;
    document.getElementById('pImage').value = p.image_url;
    document.getElementById('pDesc').value = p.description;
    document.getElementById('productModal').style.display = 'flex';
}

function closeModal(id) {
    document.getElementById(id).style.display = 'none';
}

async function saveProductData() {
    const id = document.getElementById('productId').value;
    const product = {
        name: document.getElementById('pName').value,
        category: document.getElementById('pCategory').value,
        price: document.getElementById('pPrice').value,
        image_url: document.getElementById('pImage').value,
        description: document.getElementById('pDesc').value
    };

    const method = id ? 'PUT' : 'POST';
    const url = id ? `/api/products/${id}` : '/api/products';

    await apiRequest(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(product)
    });

    closeModal('productModal');
    refreshData();
}

async function deleteProduct(id) {
    if (confirm('Supprimer ce produit ?')) {
        await apiRequest(`/api/products/${id}`, { method: 'DELETE' });
        refreshData();
    }
}

async function sendBroadcast() {
    const message = document.getElementById('bcMessage').value;
    const image = document.getElementById('bcImage').value;
    
    if (!message) return alert('Message vide');
    
    const btn = document.querySelector('.send-btn');
    btn.disabled = true;
    btn.textContent = 'Envoi en cours...';

    const res = await apiRequest('/api/broadcast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, image })
    });

    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-paper-plane"></i> Diffuser à tous';
    
    if (res && res.success) {
        alert(`Diffusé à ${res.count} utilisateurs`);
        document.getElementById('bcMessage').value = '';
        document.getElementById('bcImage').value = '';
    } else {
        alert('Erreur lors de la diffusion');
    }
}

async function fetchSuppliers() {}
async function fetchReviews() {}

async function fetchSettings() {
    const data = await apiRequest('/api/settings');
    if (!data) return;
    document.getElementById('settingBotName').value = data.bot_name || '';
    document.getElementById('settingColor').value = data.accent_color || '#00ff00';
    document.getElementById('settingMaintenance').checked = data.maintenance_mode || false;
    document.getElementById('settingMaintMessage').value = data.maintenance_message || '';
}

async function saveSettings() {
    const settings = {
        bot_name: document.getElementById('settingBotName').value,
        accent_color: document.getElementById('settingColor').value,
        admin_password: document.getElementById('settingNewPassword').value,
        maintenance_mode: document.getElementById('settingMaintenance').checked,
        maintenance_message: document.getElementById('settingMaintMessage').value
    };

    await apiRequest('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings)
    });
    alert('Paramètres sauvegardés');
}
