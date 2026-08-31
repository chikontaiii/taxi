// js/client.js

let lastOrderId = sessionStorage.getItem('lastOrderId') || null;
let unsubscribeOrder = null;
let currentOrder = null;

document.addEventListener('DOMContentLoaded', () => {
    // Подключаем анонимную аутентификацию
    auth.signInAnonymously()
        .then(() => {
            console.log('Анонимный вход выполнен, UID:', auth.currentUser.uid);
            // После входа можно продолжить инициализацию
            initPage();
        })
        .catch(error => {
            console.error('Ошибка анонимного входа:', error);
            showMessage('Ошибка авторизации, попробуйте обновить страницу');
        });

    document.getElementById('orderForm').addEventListener('submit', (e) => {
        e.preventDefault();
        createOrder();
    });

    document.getElementById('cancelOrderBtn').addEventListener('click', () => {
        cancelOrder();
    });
});

function initPage() {
    // Если есть сохранённый заказ, подписываемся на него
    if (lastOrderId) {
        subscribeToOrder(lastOrderId);
    }
    // Обработчик изменения полей для пересчёта цены
    document.getElementById('pickupAddress').addEventListener('input', updateEstimatedPrice);
    document.getElementById('dropoffAddress').addEventListener('input', updateEstimatedPrice);
}

function updateEstimatedPrice() {
    // В будущем здесь будет расчёт по расстоянию, пока фиксированная цена
    const price = 60;
    document.getElementById('estimatedPrice').textContent = price;
}

async function createOrder() {
    const phone = document.getElementById('clientPhone').value.trim();
    const pickup = document.getElementById('pickupAddress').value.trim();
    const dropoff = document.getElementById('dropoffAddress').value.trim();

    if (!phone || !pickup || !dropoff) {
        showMessage('Пожалуйста, заполните все поля');
        return;
    }

    const price = 60; // пока фиксированная

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
    // Отписываемся от предыдущей подписки
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

    // Название водителя, если есть
    let driverName = '';
    if (order.assignedDriverId) {
        // Можно получить имя водителя (пока не делаем запрос, оставим просто ID)
        driverName = ` (ID: ${order.assignedDriverId})`;
        // В будущем можно подписаться на документ водителя
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
    // Подписка обновит статус автоматически
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