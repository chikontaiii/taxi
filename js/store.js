// js/store.js

// Ключ для localStorage
const STORAGE_KEY = 'taxiAppData';

// Стартовые данные (моки)
const defaultData = {
  drivers: [
    { id: 'driver1', name: 'Асан', phone: '+996555123456', status: 'offline', currentOrderId: null }
  ],
  orders: [],
  nextOrderId: 1,
  nextDriverId: 2
};

// Загрузить данные
function loadData() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw) {
    try {
      return JSON.parse(raw);
    } catch (e) {
      console.error('Ошибка чтения данных, сбрасываем к дефолту', e);
    }
  }
  // Если данных нет или они повреждены — возвращаем копию дефолтных
  return JSON.parse(JSON.stringify(defaultData));
}

// Сохранить данные
function saveData(data) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  // Сообщаем другим вкладкам и текущей странице
  window.dispatchEvent(new CustomEvent('dataUpdated', { detail: data }));
}

// Получить текущие данные
function getData() {
  return loadData();
}

// Обновить данные: принимаем функцию, которая меняет объект
function updateData(updateFn) {
  const data = getData();
  updateFn(data);
  saveData(data);
}

// Подписка на изменения (обновление интерфейса)
function onDataUpdated(callback) {
  // Своя вкладка
  window.addEventListener('dataUpdated', (e) => callback(e.detail));
  // Другие вкладки (событие storage)
  window.addEventListener('storage', (e) => {
    if (e.key === STORAGE_KEY) {
      callback(loadData());
    }
  });
}

// Вспомогательная функция для генерации id (не используется, оставим на будущее)
function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
}