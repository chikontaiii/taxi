// js/firebase-service.js

// ========== УТИЛИТЫ ==========

function getCurrentUser() {
    return auth.currentUser;
}

// ========== ЗАКАЗЫ ==========

// Создать заказ
async function createOrder(orderData) {
    try {
        const user = auth.currentUser;
        if (!user) throw new Error('Не авторизован');

        const order = {
            ...orderData,
            clientUid: user.uid,
            assignedDriverId: null,
            status: 'SEARCHING_DRIVER',
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
            history: [{
                status: 'SEARCHING_DRIVER',
                timestamp: firebase.firestore.Timestamp.now(), // <-- исправлено
                by: 'client'
            }]
        };

        const docRef = await db.collection('orders').add(order);
        return docRef.id;
    } catch (error) {
        console.error('Ошибка создания заказа:', error);
        throw error;
    }
}

// Подписка на заказ по ID (для клиента)
function onOrderSnapshot(orderId, callback) {
    return db.collection('orders').doc(orderId)
        .onSnapshot((doc) => {
            if (doc.exists) {
                callback({ id: doc.id, ...doc.data() });
            } else {
                callback(null);
            }
        }, (error) => {
            console.error('Ошибка подписки на заказ:', error);
            callback(null);
        });
}

// Отменить заказ (клиент)
async function cancelOrderByClient(orderId) {
    const orderRef = db.collection('orders').doc(orderId);
    try {
        await db.runTransaction(async(transaction) => {
            const orderSnap = await transaction.get(orderRef);
            if (!orderSnap.exists) throw new Error('Заказ не найден');
            const order = orderSnap.data();
            const cancellable = ['NEW', 'SEARCHING_DRIVER', 'ACCEPTED'].includes(order.status);
            if (!cancellable) throw new Error('Заказ уже нельзя отменить');
            transaction.update(orderRef, {
                status: 'CANCELLED',
                updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
                history: firebase.firestore.FieldValue.arrayUnion({
                    status: 'CANCELLED',
                    timestamp: firebase.firestore.Timestamp.now(), // <-- исправлено
                    by: 'client'
                })
            });
            // Освобождаем водителя, если был назначен
            if (order.assignedDriverId) {
                const driverRef = db.collection('drivers').doc(order.assignedDriverId);
                const driverSnap = await transaction.get(driverRef);
                if (driverSnap.exists && driverSnap.data().currentOrderId === orderId) {
                    transaction.update(driverRef, {
                        currentOrderId: null,
                        status: 'online'
                    });
                }
            }
        });
        console.log('Заказ отменён');
    } catch (error) {
        console.error('Ошибка отмены:', error);
        throw error;
    }
}

// ========== ВОДИТЕЛИ ==========

async function getDriverData(driverUid) {
    const doc = await db.collection('drivers').doc(driverUid).get();
    if (doc.exists) {
        return { id: doc.id, ...doc.data() };
    } else {
        return null;
    }
}

function onDriverSnapshot(driverUid, callback) {
    return db.collection('drivers').doc(driverUid)
        .onSnapshot((doc) => {
            if (doc.exists) {
                callback({ id: doc.id, ...doc.data() });
            } else {
                callback(null);
            }
        });
}

async function setDriverStatus(driverUid, newStatus) {
    const driverRef = db.collection('drivers').doc(driverUid);
    await driverRef.update({
        status: newStatus,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
}

function onAvailableOrders(callback) {
    return db.collection('orders')
        .where('status', '==', 'SEARCHING_DRIVER')
        .where('assignedDriverId', '==', null)
        .onSnapshot((snapshot) => {
            const orders = [];
            snapshot.forEach((doc) => {
                orders.push({ id: doc.id, ...doc.data() });
            });
            callback(orders);
        }, (error) => {
            console.error('Ошибка подписки на заказы:', error);
            callback([]);
        });
}

async function acceptOrder(orderId, driverUid) {
    const orderRef = db.collection('orders').doc(orderId);
    const driverRef = db.collection('drivers').doc(driverUid);

    try {
        await db.runTransaction(async(transaction) => {
            const orderSnap = await transaction.get(orderRef);
            if (!orderSnap.exists) throw new Error('Заказ не найден');

            const order = orderSnap.data();
            if (order.status !== 'SEARCHING_DRIVER' || order.assignedDriverId) {
                throw new Error('Заказ уже недоступен');
            }

            const driverSnap = await transaction.get(driverRef);
            if (!driverSnap.exists) throw new Error('Водитель не найден');
            const driver = driverSnap.data();
            if (driver.status !== 'online' || driver.currentOrderId) {
                throw new Error('Вы не можете взять заказ сейчас');
            }

            transaction.update(orderRef, {
                status: 'ACCEPTED',
                assignedDriverId: driverUid,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
                history: firebase.firestore.FieldValue.arrayUnion({
                    status: 'ACCEPTED',
                    timestamp: firebase.firestore.Timestamp.now(), // <-- исправлено
                    by: 'driver'
                })
            });

            transaction.update(driverRef, {
                currentOrderId: orderId,
                status: 'on_ride',
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
        });
        console.log('Заказ принят успешно');
    } catch (error) {
        console.error('Ошибка принятия заказа:', error);
        throw error;
    }
}

async function updateOrderStatusByDriver(orderId, driverUid, newStatus) {
    const orderRef = db.collection('orders').doc(orderId);
    const driverRef = db.collection('drivers').doc(driverUid);

    try {
        await db.runTransaction(async(transaction) => {
            const orderSnap = await transaction.get(orderRef);
            if (!orderSnap.exists) throw new Error('Заказ не найден');
            const order = orderSnap.data();
            if (order.assignedDriverId !== driverUid) throw new Error('Вы не назначены на этот заказ');

            const allowedTransitions = {
                'ACCEPTED': ['DRIVER_ARRIVING'],
                'DRIVER_ARRIVING': ['RIDE_STARTED'],
                'RIDE_STARTED': ['COMPLETED']
            };
            if (!allowedTransitions[order.status] || !allowedTransitions[order.status].includes(newStatus)) {
                throw new Error('Недопустимый переход статуса');
            }

            transaction.update(orderRef, {
                status: newStatus,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
                history: firebase.firestore.FieldValue.arrayUnion({
                    status: newStatus,
                    timestamp: firebase.firestore.Timestamp.now(), // <-- исправлено
                    by: 'driver'
                })
            });

            if (newStatus === 'COMPLETED') {
                transaction.update(driverRef, {
                    currentOrderId: null,
                    status: 'online',
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                });
            }
        });
        console.log('Статус обновлён');
    } catch (error) {
        console.error('Ошибка обновления статуса:', error);
        throw error;
    }
}

// ========== АДМИНИСТРИРОВАНИЕ ==========

function onAllDrivers(callback) {
    return db.collection('drivers').onSnapshot((snapshot) => {
        const drivers = [];
        snapshot.forEach((doc) => {
            drivers.push({ id: doc.id, ...doc.data() });
        });
        callback(drivers);
    });
}

function onAllOrders(callback) {
    return db.collection('orders').orderBy('createdAt', 'desc').onSnapshot((snapshot) => {
        const orders = [];
        snapshot.forEach((doc) => {
            orders.push({ id: doc.id, ...doc.data() });
        });
        callback(orders);
    });
}

async function assignDriverByAdmin(orderId, driverId) {
    const orderRef = db.collection('orders').doc(orderId);
    const batch = db.batch();

    try {
        const orderSnap = await orderRef.get();
        if (!orderSnap.exists) throw new Error('Заказ не найден');
        const order = orderSnap.data();

        if (order.assignedDriverId) {
            const oldDriverRef = db.collection('drivers').doc(order.assignedDriverId);
            batch.update(oldDriverRef, {
                currentOrderId: null,
                status: 'online',
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
        }

        if (driverId) {
            const newDriverRef = db.collection('drivers').doc(driverId);
            batch.update(orderRef, {
                assignedDriverId: driverId,
                status: 'ACCEPTED',
                updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
                history: firebase.firestore.FieldValue.arrayUnion({
                    status: 'ACCEPTED',
                    timestamp: firebase.firestore.Timestamp.now(), // <-- исправлено
                    by: 'admin'
                })
            });
            batch.update(newDriverRef, {
                currentOrderId: orderId,
                status: 'on_ride',
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
        } else {
            batch.update(orderRef, {
                assignedDriverId: null,
                status: 'SEARCHING_DRIVER',
                updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
                history: firebase.firestore.FieldValue.arrayUnion({
                    status: 'SEARCHING_DRIVER',
                    timestamp: firebase.firestore.Timestamp.now(), // <-- исправлено
                    by: 'admin'
                })
            });
        }

        await batch.commit();
        console.log('Назначение обновлено');
    } catch (error) {
        console.error('Ошибка назначения водителя:', error);
        throw error;
    }
}

async function updateOrderPrice(orderId, newPrice) {
    await db.collection('orders').doc(orderId).update({
        price: newPrice,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
}

async function cancelOrderByAdmin(orderId) {
    const orderRef = db.collection('orders').doc(orderId);
    await db.runTransaction(async(transaction) => {
        const orderSnap = await transaction.get(orderRef);
        if (!orderSnap.exists) return;
        const order = orderSnap.data();
        transaction.update(orderRef, {
            status: 'CANCELLED',
            updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
            history: firebase.firestore.FieldValue.arrayUnion({
                status: 'CANCELLED',
                timestamp: firebase.firestore.Timestamp.now(), // <-- исправлено
                by: 'admin'
            })
        });
        if (order.assignedDriverId) {
            const driverRef = db.collection('drivers').doc(order.assignedDriverId);
            const driverSnap = await transaction.get(driverRef);
            if (driverSnap.exists && driverSnap.data().currentOrderId === orderId) {
                transaction.update(driverRef, {
                    currentOrderId: null,
                    status: 'online'
                });
            }
        }
    });
}

async function createOrderByAdmin(orderData) {
    const order = {
        ...orderData,
        assignedDriverId: null,
        status: 'SEARCHING_DRIVER',
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        history: [{
            status: 'SEARCHING_DRIVER',
            timestamp: firebase.firestore.Timestamp.now(), // <-- исправлено
            by: 'admin'
        }],
        clientUid: null
    };
    const docRef = await db.collection('orders').add(order);
    return docRef.id;
}