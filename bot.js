const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');
const path = require('path');
const express = require('express');
const cors = require('cors');
require('dotenv').config();

// Express server for WebApp API
const app = express();
app.use(cors());
app.use(express.json());

// Store bot instance for API access
let botInstance = null;

// Config
const BOT_TOKEN = process.env.BOT_TOKEN || '8768687172:AAGDag_T2xZ2ArqaYsyGAUoqrRAy4B5esBw';
const ADMIN_ID = process.env.ADMIN_ID || '5330674632';
const WEBAPP_URL = process.env.WEBAPP_URL || 'https://fpjd3yyodfh7w.ok.kimi.link';

// Courses
const COURSES = {
  econom: {
    id: 'econom',
    price: 500,
    name_ru: 'Эконом',
    name_en: 'Economy',
    description_ru: 'Скажем вам что вы немощь',
    description_en: "We'll tell you that you're weak",
    icon: '💪'
  },
  premium: {
    id: 'premium',
    price: 4000,
    name_ru: 'Премиум',
    name_en: 'Premium',
    description_ru: 'Скажем вам что вы бог этой игры и вообще крутой',
    description_en: "We'll tell you that you're the god of this game and totally awesome",
    icon: '👑'
  }
};

// Translations
const TRANSLATIONS = {
  ru: {
    welcome: '👋 Добро пожаловать в Virgini\'a Training!\n\nВыберите язык / Choose language:',
    main_menu: '🎮 Главное меню\n\nВыберите действие:',
    courses: '📚 Наши курсы по Valorant:',
    buy_course: '💳 Купить курс',
    my_courses: '🎯 Мои курсы',
    support: '📞 Поддержка',
    language: '🌍 Язык',
    back: '⬅️ Назад',
    select_payment: 'Выберите способ оплаты:',
    payment_sbp: '💳 СБП (Быстрая оплата)',
    pay_button: '💳 Оплатить {price}₽',
    payment_success: '✅ Оплата прошла успешно!\n\nКурс активирован. Наш менеджер свяжется с вами в ближайшее время.',
    payment_pending: '⏳ Ожидание оплаты...',
    contact_admin: '📞 Связаться с администратором',
    open_webapp: '🌐 Открыть магазин',
    help: '❓ Помощь',
    course_includes: 'Что включено:',
    no_courses: '📝 У вас пока нет курсов.',
    your_courses: '🎯 Ваши курсы:\n\n'
  },
  en: {
    welcome: "👋 Welcome to Virgini'a Training!\n\nChoose language / Выберите язык:",
    main_menu: '🎮 Main Menu\n\nChoose an action:',
    courses: '📚 Our Valorant courses:',
    buy_course: '💳 Buy Course',
    my_courses: '🎯 My Courses',
    support: '📞 Support',
    language: '🌍 Language',
    back: '⬅️ Back',
    select_payment: 'Select payment method:',
    payment_sbp: '💳 SBP (Fast Payment)',
    pay_button: '💳 Pay {price}₽',
    payment_success: '✅ Payment successful!\n\nCourse activated. Our manager will contact you soon.',
    payment_pending: '⏳ Waiting for payment...',
    contact_admin: '📞 Contact admin',
    open_webapp: '🌐 Open Shop',
    help: '❓ Help',
    course_includes: "What's included:",
    no_courses: "📝 You don't have any courses yet.",
    your_courses: '🎯 Your courses:\n\n'
  }
};

// Database
const DATA_FILE = path.join(__dirname, 'bot_data.json');
let db = { users: {}, orders: {}, purchased: {}, orderCounter: 1 };

function loadDB() {
  if (fs.existsSync(DATA_FILE)) {
    try {
      db = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    } catch (e) {
      console.log('Error loading DB:', e);
    }
  }
}

function saveDB() {
  fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2));
}

// Helper functions
function getUser(userId) {
  return db.users[userId.toString()] || null;
}

function createUser(userId, username, firstName, lastName) {
  db.users[userId.toString()] = {
    user_id: userId,
    username: username || '',
    first_name: firstName || '',
    last_name: lastName || '',
    language: 'ru'
  };
  saveDB();
}

function setUserLanguage(userId, language) {
  const user = db.users[userId.toString()];
  if (user) {
    user.language = language;
    saveDB();
  }
}

function getUserLanguage(userId) {
  const user = db.users[userId.toString()];
  return user?.language || 'ru';
}

function createOrder(userId, courseId, courseName, price) {
  const orderId = db.orderCounter++;
  db.orders[orderId.toString()] = {
    order_id: orderId,
    user_id: userId,
    course_id: courseId,
    course_name: courseName,
    price: price,
    status: 'pending'
  };
  saveDB();
  return orderId;
}

function addPurchasedCourse(userId, courseId) {
  const key = userId.toString();
  if (!db.purchased[key]) {
    db.purchased[key] = [];
  }
  if (!db.purchased[key].includes(courseId)) {
    db.purchased[key].push(courseId);
    saveDB();
  }
}

function getUserPurchasedCourses(userId) {
  return db.purchased[userId.toString()] || [];
}

function hasPurchasedCourse(userId, courseId) {
  const courses = getUserPurchasedCourses(userId);
  return courses.includes(courseId);
}

// Initialize bot
loadDB();
const bot = new TelegramBot(BOT_TOKEN, { polling: true });
botInstance = bot;

console.log('🤖 Virgini\'a Bot started!');

// API endpoint for WebApp purchases
app.post('/api/purchase', (req, res) => {
  const { userId, courseId, courseName, price } = req.body;
  
  if (!userId || !courseId) {
    return res.status(400).json({ error: 'Missing data' });
  }
  
  // Create order
  const orderId = createOrder(userId, courseId, courseName, price);
  
  // Mark as purchased
  addPurchasedCourse(userId, courseId);
  
  // Get course info
  const course = COURSES[courseId];
  
  // Notify admin
  notifyAdmin(userId, course, orderId);
  
  // Confirm to user
  const lang = getUserLanguage(userId);
  const t = TRANSLATIONS[lang];
  bot.sendMessage(userId, t.payment_success);
  
  res.json({ success: true, orderId });
});

// Start API server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 API server running on port ${PORT}`);
});

// Start command
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  const user = msg.from;

  // Create user if not exists
  if (!getUser(user.id)) {
    createUser(user.id, user.username, user.first_name, user.last_name);
  }

  // Language selection
  const keyboard = {
    inline_keyboard: [
      [
        { text: '🇷🇺 Русский', callback_data: 'lang_ru' },
        { text: '🇬🇧 English', callback_data: 'lang_en' }
      ]
    ]
  };

  bot.sendMessage(chatId, TRANSLATIONS.ru.welcome, { reply_markup: keyboard });
});

// Callback queries
bot.on('callback_query', (query) => {
  const chatId = query.message.chat.id;
  const userId = query.from.id;
  const data = query.data;
  const lang = getUserLanguage(userId);
  const t = TRANSLATIONS[lang];

  bot.answerCallbackQuery(query.id);

  // Language selection
  if (data.startsWith('lang_')) {
    const selectedLang = data.split('_')[1];
    setUserLanguage(userId, selectedLang);
    showMainMenu(chatId, userId);
    return;
  }

  // Main menu
  if (data === 'main_menu') {
    showMainMenu(chatId, userId);
    return;
  }

  // Buy course
  if (data === 'buy_course') {
    showCourses(chatId, userId);
    return;
  }

  // Course selection
  if (data.startsWith('course_')) {
    const courseId = data.split('_')[1];
    showCourseDetails(chatId, userId, courseId);
    return;
  }

  // Payment
  if (data.startsWith('pay_')) {
    const parts = data.split('_');
    const paymentMethod = parts[1];
    const courseId = parts[2];
    processPayment(chatId, userId, courseId, paymentMethod);
    return;
  }

  // My courses
  if (data === 'my_courses') {
    showMyCourses(chatId, userId);
    return;
  }

  // Support
  if (data === 'support') {
    showSupport(chatId, userId);
    return;
  }

  // Help
  if (data === 'help') {
    showHelp(chatId, userId);
    return;
  }

  // Change language
  if (data === 'change_lang') {
    const keyboard = {
      inline_keyboard: [
        [
          { text: '🇷🇺 Русский', callback_data: 'lang_ru' },
          { text: '🇬🇧 English', callback_data: 'lang_en' }
        ]
      ]
    };
    bot.sendMessage(chatId, TRANSLATIONS.ru.welcome, { reply_markup: keyboard });
    return;
  }
});

// Show main menu
function showMainMenu(chatId, userId) {
  const lang = getUserLanguage(userId);
  const t = TRANSLATIONS[lang];

  const keyboard = {
    inline_keyboard: [
      [{ text: t.open_webapp, web_app: { url: WEBAPP_URL } }],
      [
        { text: t.buy_course, callback_data: 'buy_course' },
        { text: t.my_courses, callback_data: 'my_courses' }
      ],
      [
        { text: t.support, callback_data: 'support' },
        { text: t.language, callback_data: 'change_lang' }
      ],
      [{ text: t.help, callback_data: 'help' }]
    ]
  };

  bot.sendMessage(chatId, t.main_menu, { reply_markup: keyboard });
}

// Show courses
function showCourses(chatId, userId) {
  const lang = getUserLanguage(userId);
  const t = TRANSLATIONS[lang];

  const keyboard = {
    inline_keyboard: Object.values(COURSES).map(course => [
      {
        text: `${course.icon} ${course[`name_${lang}`]} - ${course.price}₽`,
        callback_data: `course_${course.id}`
      }
    ]).concat([[{ text: t.back, callback_data: 'main_menu' }]])
  };

  bot.sendMessage(chatId, t.courses, { reply_markup: keyboard });
}

// Show course details
function showCourseDetails(chatId, userId, courseId) {
  const lang = getUserLanguage(userId);
  const t = TRANSLATIONS[lang];
  const course = COURSES[courseId];

  if (!course) return;

  // Check if already purchased
  if (hasPurchasedCourse(userId, courseId)) {
    const text = lang === 'ru' ? '✅ У вас уже есть этот курс!' : '✅ You already have this course!';
    const keyboard = {
      inline_keyboard: [[{ text: t.back, callback_data: 'buy_course' }]]
    };
    bot.sendMessage(chatId, text, { reply_markup: keyboard });
    return;
  }

  const name = course[`name_${lang}`];
  const desc = course[`description_${lang}`];
  const text = `${course.icon} ${name}\n\n${desc}\n\n💰 ${lang === 'ru' ? 'Цена' : 'Price'}: ${course.price}₽`;

  const keyboard = {
    inline_keyboard: [
      [{ text: t.payment_sbp, callback_data: `pay_sbp_${courseId}` }],
      [{ text: t.back, callback_data: 'buy_course' }]
    ]
  };

  bot.sendMessage(chatId, text, { reply_markup: keyboard });
}

// Process payment
function processPayment(chatId, userId, courseId, paymentMethod) {
  const lang = getUserLanguage(userId);
  const t = TRANSLATIONS[lang];
  const course = COURSES[courseId];

  if (!course) return;

  // Create order
  const orderId = createOrder(userId, courseId, course[`name_${lang}`], course.price);

  // Demo payment - just simulate success
  setTimeout(() => {
    // Mark as purchased
    addPurchasedCourse(userId, courseId);

    // Notify user
    bot.sendMessage(chatId, t.payment_success);

    // Notify admin
    notifyAdmin(userId, course, orderId);
  }, 2000);

  // Show processing message
  bot.sendMessage(chatId, t.payment_pending);
}

// Notify admin about purchase
function notifyAdmin(userId, course, orderId) {
  const user = getUser(userId);
  if (!user) return;

  const usernameText = user.username ? `@${user.username}` : 'Нет username';

  const text = (
    `🎉 НОВАЯ ПОКУПКА!\n\n` +
    `👤 Покупатель: ${user.first_name}\n` +
    `📱 Username: ${usernameText}\n` +
    `🆔 ID: ${userId}\n\n` +
    `📚 Курс: ${course.name_ru}\n` +
    `💰 Сумма: ${course.price}₽`
  );

  bot.sendMessage(ADMIN_ID, text);
}

// Show my courses
function showMyCourses(chatId, userId) {
  const lang = getUserLanguage(userId);
  const t = TRANSLATIONS[lang];
  const purchased = getUserPurchasedCourses(userId);

  let text;
  if (purchased.length === 0) {
    text = t.no_courses;
  } else {
    text = t.your_courses;
    purchased.forEach(courseId => {
      const course = COURSES[courseId];
      if (course) {
        text += `${course.icon} ${course[`name_${lang}`]}\n`;
      }
    });
  }

  const keyboard = {
    inline_keyboard: [[{ text: t.back, callback_data: 'main_menu' }]]
  };

  bot.sendMessage(chatId, text, { reply_markup: keyboard });
}

// Show support
function showSupport(chatId, userId) {
  const lang = getUserLanguage(userId);
  const t = TRANSLATIONS[lang];

  const text = lang === 'ru'
    ? '📞 Поддержка\n\nЕсли у вас есть вопросы, напишите нам:\n@virginia_support'
    : '📞 Support\n\nIf you have questions, contact us:\n@virginia_support';

  const keyboard = {
    inline_keyboard: [[{ text: t.back, callback_data: 'main_menu' }]]
  };

  bot.sendMessage(chatId, text, { reply_markup: keyboard });
}

// Show help
function showHelp(chatId, userId) {
  const lang = getUserLanguage(userId);
  const t = TRANSLATIONS[lang];

  const text = lang === 'ru'
    ? '❓ Помощь\n\n• Нажмите Купить курс чтобы выбрать тренировку\n• Оплатите через СБП\n• После оплаты с вами свяжется менеджер\n\nПо вопросам: @virginia_support'
    : '❓ Help\n\n• Click Buy Course to select training\n• Pay via SBP\n• Manager will contact you after payment\n\nQuestions: @virginia_support';

  const keyboard = {
    inline_keyboard: [[{ text: t.back, callback_data: 'main_menu' }]]
  };

  bot.sendMessage(chatId, text, { reply_markup: keyboard });
}

// Handle WebApp data (when user buys from mini app)
bot.on('web_app_data', (msg) => {
  const userId = msg.from.id;
  const data = JSON.parse(msg.web_app_data.data);
  
  if (data.action === 'buy') {
    const courseId = data.courseId;
    const courseName = data.courseName;
    const price = data.price;
    
    // Create order
    const orderId = createOrder(userId, courseId, courseName, price);
    
    // Mark as purchased
    addPurchasedCourse(userId, courseId);
    
    // Get course info
    const course = COURSES[courseId];
    
    // Notify admin
    notifyAdmin(userId, course, orderId);
    
    // Confirm to user
    const lang = getUserLanguage(userId);
    const t = TRANSLATIONS[lang];
    bot.sendMessage(msg.chat.id, t.payment_success);
  }
});

// Handle errors
bot.on('polling_error', (error) => {
  console.log('Polling error:', error.message);
});