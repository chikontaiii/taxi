// js/admin.js

let currentFilter = 'active'; // 'active', 'new', 'completed'
let unsubscribeDrivers = null;
let unsubscribeOrders = null;
let allDrivers = [];
let allOrders = [];

document.addEventListener('DOMContentLoaded', () => {
    auth.onAuthStateChanged((user) => {
        if (user) {
            // Проверяем, админ ли это (можно хранить в кастомных claims, но пока просто разрешим)
            initAdminDashboard(user.uid);
        } else {
            showLoginForm();
        }
    });

    document.getElementById('loginForm').addEventListener('submit', (e) => {
        e.preventDefault();
        loginAdmin();
    });

    document.getElementById('logoutBtn').addEventListener('click', () => {
        auth.signOut().then(() => {
            if (unsubscribeDrivers) unsubscribeDrivers();
            if (unsubscribeOrders) unsubscribeOrders();
            showLoginForm();
        });
    });

    document.getElementById('ordersTabs').addEventListener('click', (e) => {
        if (e.target.tagName === 'BUTTON') {
            currentFilter = e.target.dataset.filter;
            renderOrders();
        }
    });

    document.getElementById('showCreateOrderBtn').addEventListener('click', () => {
        document.getElementById('createOrderModal').classList.remove('hidden');
    });
    document.getElementById('closeModalBtn').addEventListener('click', () => {
        document.getElementById('createOrderModal').classList.add('hidden');
    });
    document.getElementById('manualOrderForm').addEventListener('submit', (e) => {
        e.preventDefault();
        createManualOrder();
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

async function loginAdmin() {
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

async function initAdminDashboard(uid) {
    showDashboard();
    // Подписка на всех водителей
    unsubscribeDrivers = onAllDrivers((drivers) => {
        allDrivers = drivers;
        renderDrivers();
        renderOrders(); // потому что в заказах могут быть выпадающие списки водителей
    });
    // Подписка на все заказы
    unsubscribeOrders = onAllOrders((orders) => {
        allOrders = orders;
        renderOrders();
    });
}

function renderDrivers() {
    const container = document.getElementById('driversList');
    container.innerHTML = allDrivers.map(driver => `
    <div class="driver-item">
      <div>
        <strong>${driver.name || 'Без имени'}</strong> (${driver.phone || ''})
        <div>Текущий заказ: ${driver.currentOrderId || 'нет'}</div>
      </div>
      <div>
        <span class="driver-status">${getDriverStatusText(driver.status)}</span>
        <button class="btn btn-secondary" style="width:auto;" onclick="toggleDriverStatus('${driver.id}')">Изменить</button>
      </div>
    </div>
  `).join('');
}

// Глобальная функция для вызова из HTML onclick
window.toggleDriverStatus = async function(driverId) {
    const driver = allDrivers.find(d => d.id === driverId);
    if (!driver) return;
    const newStatus = driver.status === 'online' ? 'offline' : 'online';
    await setDriverStatus(driverId, newStatus);
};

function renderOrders() {
    const container = document.getElementById('ordersList');
    let orders = [];
    if (currentFilter === 'new') {
        orders = allOrders.filter(o => ['NEW', 'SEARCHING_DRIVER'].includes(o.status));
    } else if (currentFilter === 'active') {
        orders = allOrders.filter(o => ['ACCEPTED', 'DRIVER_ARRIVING', 'RIDE_STARTED'].includes(o.status));
    } else if (currentFilter === 'completed') {
        orders = allOrders.filter(o => ['COMPLETED', 'CANCELLED'].includes(o.status));
    }

    if (orders.length === 0) {
        container.innerHTML = '<p>Нет заказов</p>';
        return;
    }

    container.innerHTML = orders.map(order => {
        const driverOptions = allDrivers.map(driver =>
            `<option value="${driver.id}" ${order.assignedDriverId === driver.id ? 'selected' : ''}>${driver.name || driver.id}</option>`
        ).join('');

        return `
      <div class="order-card">
        <div class="order-header">
          <span class="status ${order.status}">${getStatusText(order.status)}</span>
          <span class="price">${order.price} сом</span>
        </div>
        <div>Откуда: ${order.pickupAddress}</div>
        <div>Куда: ${order.dropoffAddress}</div>
        <div>Клиент: ${order.clientPhone}</div>
        <div>ID: ${order.id}</div>
        <div>Создан: ${order.createdAt ? new Date(order.createdAt.seconds * 1000).toLocaleString() : '—'}</div>
        <hr>
        <div class="form-group">
          <label>Водитель</label>
          <select class="assign-driver" data-order-id="${order.id}">
            <option value="">Не назначен</option>
            ${driverOptions}
          </select>
        </div>
        <div class="form-group">
          <label>Цена</label>
          <input type="number" class="change-price" data-order-id="${order.id}" value="${order.price}">
        </div>
        <button class="btn btn-danger cancel-order" data-order-id="${order.id}">Отменить заказ</button>
      </div>
    `;
    }).join('');

    container.querySelectorAll('.assign-driver').forEach(select => {
        select.addEventListener('change', (e) => {
            assignDriverHandler(e.target.dataset.orderId, e.target.value);
        });
    });

    container.querySelectorAll('.change-price').forEach(input => {
        input.addEventListener('change', (e) => {
            const newPrice = parseFloat(e.target.value);
            if (newPrice >= 0) updatePriceHandler(e.target.dataset.orderId, newPrice);
        });
    });

    container.querySelectorAll('.cancel-order').forEach(btn => {
        btn.addEventListener('click', () => cancelOrderHandler(btn.dataset.orderId));
    });
}

async function assignDriverHandler(orderId, driverId) {
    try {
        await assignDriverByAdmin(orderId, driverId);
    } catch (error) {
        alert('Ошибка назначения: ' + error.message);
    }
}

async function updatePriceHandler(orderId, newPrice) {
    try {
        await updateOrderPrice(orderId, newPrice);
    } catch (error) {
        alert('Ошибка изменения цены: ' + error.message);
    }
}

async function cancelOrderHandler(orderId) {
    if (!confirm('Отменить этот заказ?')) return;
    try {
        await cancelOrderByAdmin(orderId);
    } catch (error) {
        alert('Ошибка отмены: ' + error.message);
    }
}

async function createManualOrder() {
    const phone = document.getElementById('manualClientPhone').value.trim();
    const pickup = document.getElementById('manualPickup').value.trim();
    const dropoff = document.getElementById('manualDropoff').value.trim();
    const price = parseInt(document.getElementById('manualPrice').value);

    if (!phone || !pickup || !dropoff || !price) {
        alert('Заполните все поля');
        return;
    }

    try {
        await createOrderByAdmin({
            clientPhone: phone,
            pickupAddress: pickup,
            dropoffAddress: dropoff,
            price: price
        });
        document.getElementById('manualOrderForm').reset();
        document.getElementById('createOrderModal').classList.add('hidden');
    } catch (error) {
        alert('Ошибка создания заказа: ' + error.message);
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

function getDriverStatusText(status) {
    const statuses = {
        online: '🟢 На линии',
        offline: '⚫ Не на линии',
        on_ride: '🔵 На заказе'
    };
    return statuses[status] || status;
}

function showMessage(text) {
    // можно использовать alert или встроенное сообщение
    alert(text);
}