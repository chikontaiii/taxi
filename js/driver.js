// js/driver.js
function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}
let currentDriver = null;
let currentOrder = null;
let unsubscribeDriver = null;
let unsubscribeAvailableOrders = null;
let unsubscribeCurrentOrder = null;

document.addEventListener('DOMContentLoaded', () => {
    auth.onAuthStateChanged((user) => {
        if (user) {
            initDriverDashboard(user.uid);
        } else {
            showLoginForm();
        }
    });

    document.getElementById('loginForm').addEventListener('submit', (e) => {
        e.preventDefault();
        loginDriver();
    });

    document.getElementById('logoutBtn').addEventListener('click', () => {
        auth.signOut().then(() => {
            if (unsubscribeDriver) unsubscribeDriver();
            if (unsubscribeAvailableOrders) unsubscribeAvailableOrders();
            if (unsubscribeCurrentOrder) unsubscribeCurrentOrder();
            showLoginForm();
        });
    });

    document.getElementById('driverStatus').addEventListener('change', (e) => {
        if (currentDriver) {
            updateDriverStatus(e.target.value);
        }
    });
});

function showLoginForm() {
    document.getElementById('loginSection').classList.remove('hidden');
    document.getElementById('dashboardSection').classList.add('hidden');
}

function showDashboard() {
    document.getElementById('loginSection').classList.add('hidden');
    document.getElementById('dashboardSection').classList.remove('hidden');
}

async function loginDriver() {
    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;

    try {
        await auth.signInWithEmailAndPassword(email, password);
    } catch (error) {
        const errorDiv = document.getElementById('loginError');
        errorDiv.textContent = 'Ошибка входа: ' + error.message;
        errorDiv.classList.remove('hidden');
    }
}

async function initDriverDashboard(uid) {
    try {
        const driverData = await getDriverData(uid);
        if (!driverData) {
            alert('Ваш аккаунт не связан с профилем водителя. Обратитесь к администратору.');
            await auth.signOut();
            return;
        }
        currentDriver = driverData;
        document.getElementById('driverName').textContent = driverData.name || 'Водитель';
        document.getElementById('driverStatus').value = driverData.status;
        showDashboard();

        unsubscribeDriver = onDriverSnapshot(uid, (driver) => {
            if (driver) {
                currentDriver = driver;
                document.getElementById('driverStatus').value = driver.status;
                if (driver.currentOrderId) {
                    subscribeToCurrentOrder(driver.currentOrderId);
                } else {
                    if (unsubscribeCurrentOrder) {
                        unsubscribeCurrentOrder();
                        unsubscribeCurrentOrder = null;
                    }
                    currentOrder = null;
                    renderCurrentOrderSection();
                    renderAvailableOrders();
                }
            }
        });

        unsubscribeAvailableOrders = onAvailableOrders((orders) => {
            window.availableOrders = orders;
            renderAvailableOrders();
        });

        if (currentDriver.currentOrderId) {
            subscribeToCurrentOrder(currentDriver.currentOrderId);
        }
    } catch (error) {
        console.error('Ошибка инициализации водителя:', error);
        showLoginForm();
    }
}

function subscribeToCurrentOrder(orderId) {
    if (unsubscribeCurrentOrder) {
        unsubscribeCurrentOrder();
    }
    unsubscribeCurrentOrder = onOrderSnapshot(orderId, (order) => {
        currentOrder = order;
        renderCurrentOrderSection();
    });
}

async function updateDriverStatus(newStatus) {
    if (!currentDriver) return;
    if (newStatus === 'offline' && currentDriver.currentOrderId) {
        alert('Нельзя уйти оффлайн во время заказа');
        document.getElementById('driverStatus').value = currentDriver.status;
        return;
    }
    await setDriverStatus(currentDriver.id, newStatus);
}

function renderAvailableOrders() {
    const container = document.getElementById('availableOrdersList');
    const orders = window.availableOrders || [];
    if (orders.length === 0) {
        container.innerHTML = '<p>Нет доступных заказов</p>';
        return;
    }
    container.innerHTML = orders.map(order => `
    <div class="order-card">
      <div class="order-header">
        <span class="status ${order.status}">${getStatusText(order.status)}</span>
        <span class="price">${order.price} сом</span>
      </div>
      <div class="order-addresses">
        <div>📍 ${order.pickupAddress}</div>
        <div>🏁 ${order.dropoffAddress}</div>
      </div>
      <button class="btn btn-success take-btn" data-order-id="${order.id}">ВЗЯТЬ ЗАКАЗ</button>
    </div>
  `).join('');

    container.querySelectorAll('.take-btn').forEach(btn => {
        btn.addEventListener('click', () => acceptOrderHandler(btn.dataset.orderId));
    });
}

async function acceptOrderHandler(orderId) {
    if (!currentDriver) return;
    try {
        await acceptOrder(orderId, currentDriver.id);
    } catch (error) {
        alert('Не удалось взять заказ: ' + error.message);
    }
}

function renderCurrentOrderSection() {
    const section = document.getElementById('currentOrderSection');
    const details = document.getElementById('currentOrderDetails');
    const actions = document.getElementById('actionButtons');

    if (!currentOrder) {
        section.classList.add('hidden');
        return;
    }
    section.classList.remove('hidden');
    details.innerHTML = `
    <div class="order-card">
      <div class="order-header">
        <span class="status ${currentOrder.status}">${getStatusText(currentOrder.status)}</span>
        <span class="price">${currentOrder.price} сом</span>
      </div>
      <div class="order-addresses">
        <div>📍 Откуда: ${currentOrder.pickupAddress}</div>
        <div>🏁 Куда: ${currentOrder.dropoffAddress}</div>
      </div>
      <div>Клиент: ${currentOrder.clientPhone}</div>
      <div>ID: ${currentOrder.id}</div>
    </div>
  `;

    actions.innerHTML = '';
    switch (currentOrder.status) {
        case 'ACCEPTED':
            addActionButton('Я подъехал', () => changeOrderStatus('DRIVER_ARRIVING'));
            break;
        case 'DRIVER_ARRIVING':
            addActionButton('Начать поездку', () => changeOrderStatus('RIDE_STARTED'));
            break;
        case 'RIDE_STARTED':
            addActionButton('Завершить поездку', () => changeOrderStatus('COMPLETED'));
            break;
    }
}

function addActionButton(text, onClick) {
    const container = document.getElementById('actionButtons');
    const btn = document.createElement('button');
    btn.className = 'btn btn-primary';
    btn.textContent = text;
    btn.addEventListener('click', onClick);
    container.appendChild(btn);
}

async function changeOrderStatus(newStatus) {
    if (!currentDriver || !currentOrder) return;
    try {
        await updateOrderStatusByDriver(currentOrder.id, currentDriver.id, newStatus);
    } catch (error) {
        alert('Ошибка: ' + error.message);
    }
}

function getStatusText(status) {
    const statuses = {
        NEW: 'Новый',
        SEARCHING_DRIVER: 'Ищем водителя',
        ACCEPTED: 'Водитель назначен',
        DRIVER_ARRIVING: 'Водитель подъезжает',
        RIDE_STARTED: 'Поездка началась',
        COMPLETED: 'Завершён',
        CANCELLED: 'Отменён'
    };
    return statuses[status] || status;
}