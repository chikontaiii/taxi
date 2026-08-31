// js/client.js
function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}
let lastOrderId = sessionStorage.getItem('lastOrderId') || null;
let unsubscribeOrder = null;
let currentOrder = null;

document.addEventListener('DOMContentLoaded', () => {
    auth.signInAnonymously()
        .then(() => {
            console.log('Анонимный вход выполнен, UID:', auth.currentUser.uid);
            initPage();
        })
        .catch(error => {
            console.error('Ошибка анонимного входа:', error);
            showMessage('Ошибка авторизации, попробуйте обновить страницу');
        });

    document.getElementById('orderForm').addEventListener('submit', (e) => {
        e.preventDefault();
        submitOrder();
    });

    document.getElementById('cancelOrderBtn').addEventListener('click', () => {
        cancelOrder();
    });
});

function initPage() {
    if (lastOrderId) {
        subscribeToOrder(lastOrderId);
    }
    document.getElementById('pickupAddress').addEventListener('input', updateEstimatedPrice);
    document.getElementById('dropoffAddress').addEventListener('input', updateEstimatedPrice);
}

function updateEstimatedPrice() {
    const price = 60; // пока фиксированная цена
    document.getElementById('estimatedPrice').textContent = price;
}

async function submitOrder() {
    const phone = document.getElementById('clientPhone').value.trim();
    const pickup = document.getElementById('pickupAddress').value.trim();
    const dropoff = document.getElementById('dropoffAddress').value.trim();

    if (!phone || !pickup || !dropoff) {
        showMessage('Пожалуйста, заполните все поля');
        return;
    }

    const price = 60;

    try {
        const orderId = await createOrder({
            clientPhone: phone,
            pickupAddress: pickup,
            dropoffAddress: dropoff,
            price: price
        });

        lastOrderId = orderId;
        sessionStorage.setItem('lastOrderId', lastOrderId);
        document.getElementById('orderForm').reset();
        document.getElementById('estimatedPrice').textContent = '—';
        showMessage('Заказ создан! Ожидайте водителя.');
        subscribeToOrder(orderId);
    } catch (error) {
        showMessage('Не удалось создать заказ: ' + error.message);
    }
}

function subscribeToOrder(orderId) {
    if (unsubscribeOrder) {
        unsubscribeOrder();
    }

    unsubscribeOrder = onOrderSnapshot(orderId, (order) => {
        currentOrder = order;
        renderOrderStatus();
    });
}

function renderOrderStatus() {
    const statusContainer = document.getElementById('orderStatus');
    const detailsContainer = document.getElementById('orderDetails');
    const cancelBtn = document.getElementById('cancelOrderBtn');

    if (!currentOrder) {
        statusContainer.classList.add('hidden');
        return;
    }

    statusContainer.classList.remove('hidden');
    const order = currentOrder;

    let driverName = '';
    if (order.assignedDriverId) {
        driverName = ` (ID: ${order.assignedDriverId})`;
    }

    detailsContainer.innerHTML = `
    <div class="order-card">
      <div class="order-header">
        <span class="status ${order.status}">${getStatusText(order.status)}</span>
        <span class="price">${order.price} сом</span>
      </div>
      <div class="order-addresses">
        <div>📍 Откуда: ${order.pickupAddress}</div>
        <div>🏁 Куда: ${order.dropoffAddress}</div>
      </div>
      <div>ID заказа: ${order.id}</div>
      ${order.assignedDriverId ? `<div>Водитель: ${driverName}</div>` : ''}
    </div>
  `;

  const cancellable = ['NEW', 'SEARCHING_DRIVER', 'ACCEPTED'].includes(order.status);
  if (cancellable) {
    cancelBtn.classList.remove('hidden');
  } else {
    cancelBtn.classList.add('hidden');
  }
}

async function cancelOrder() {
  if (!lastOrderId) return;
  try {
    await cancelOrderByClient(lastOrderId);
    showMessage('Заказ отменён');
  } catch (error) {
    showMessage('Ошибка отмены: ' + error.message);
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

function showMessage(text) {
  const msg = document.getElementById('message');
  msg.textContent = text;
  msg.classList.remove('hidden');
  setTimeout(() => msg.classList.add('hidden'), 3000);
}