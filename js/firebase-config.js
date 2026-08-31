// js/firebase-config.js

const firebaseConfig = {
    apiKey: "AIzaSyAiSnHjfDM-Khw6gdHcNU7bMZvue16pd14",
    authDomain: "taxi-selo.firebaseapp.com",
    projectId: "taxi-selo",
    storageBucket: "taxi-selo.firebasestorage.app",
    messagingSenderId: "82568908064",
    appId: "1:82568908064:web:96cfc5a2bf0879bc711b45"
};

// Инициализация Firebase
firebase.initializeApp(firebaseConfig);

// Экспортируем сервисы
const db = firebase.firestore();
const auth = firebase.auth();

console.log('Firebase инициализирован, проект:', firebaseConfig.projectId);