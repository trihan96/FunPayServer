await import('./modules.js');

// MODULES
const log = global.log;
const c = global.chalk;
const { loadSettings } = global.storage;
const { exit } = global.helpers;
const { enableLotsRaise } = global.raise;
const { updateGoodsState } = global.goods;
const { updateCategoriesData } = global.categories;
const { getUserData, enableUserDataUpdate, countTradeProfit } = global.account;

const Runner = global.runner;
const TelegramBot = global.telegram;

const { enableAutoResponse, processMessages, processIncomingMessages, autoResponse, addUsersToFile } = global.chat;
const { checkForNewOrders, enableAutoIssue, getLotNames, clearFollowUpMessages } = global.sales;
const { checkGoodsState, enableGoodsStateCheck } = global.activity;

global.startTime = Date.now();

// Handle process exit
process.on('exit', () => {
    // Clear all scheduled follow-up messages
    clearFollowUpMessages();
});

// UncaughtException Handler
process.on('uncaughtException', (e) => {
    log('Ошибка: необработанное исключение. Сообщите об этом разработчику.', 'r');
    log(e.stack);
});

// Loading data
const settings = global.settings;

log(`Получаем данные пользователя...`, 'c');
const userData = await getUserData();
if(!userData) await exit();
log(`Привет, ${userData.userName}!`, 'm');

if(settings.lotsRaise == true)
    await updateCategoriesData();

if(settings.goodsStateCheck == true)
    await updateGoodsState();

const runner = new Runner();

// Starting threads
if(settings.lotsRaise == true) 
    enableLotsRaise();

if(settings.goodsStateCheck == true || settings.autoIssue == true) {
    runner.registerNewOrderCallback(onNewOrder);
}

if(settings.goodsStateCheck == true) {
    enableGoodsStateCheck();
}

if(settings.autoIssue == true) {
    enableAutoIssue();
}

if(settings.autoResponse == true) {
    runner.registerNewMessageCallback(onNewMessage);
    enableAutoResponse();
}

if(settings.newMessageNotification == true || settings.greetingMessage == true) {
    runner.registerNewIncomingMessageCallback(onNewIncomingMessage);
}

if(settings.greetingMessage == true && settings.greetingMessageText) {
    await addUsersToFile();
}

enableUserDataUpdate(300 * 1000);

// Start runner loop
if(settings.alwaysOnline == true 
    || settings.autoIssue == true 
    || settings.autoResponse == true 
    || settings.goodsStateCheck == true
    || settings.newMessageNotification == true
    || settings.newOrderNotification == true
    || settings.greetingMessage == true) {
    await runner.start();
}

// Start telegram bot
global.telegramBot = null;
if(settings.telegramBot == true) {
    try {
        global.telegramBot = new TelegramBot(settings.telegramToken);
        await global.telegramBot.run();
        log(`Telegram бот успешно инициализирован`, 'g');
    } catch (error) {
        log(`Ошибка инициализации Telegram бота: ${error}`, 'r');
        global.telegramBot = null;
    }
}

if(settings.telegramBot == true && global.telegramBot) {
    if(settings.newMessageNotification == true) {
        log(`Уведомления о новых сообщениях ${c.yellowBright('включены')}.`, 'g');
    }
    if(settings.newOrderNotification == true) {
        log(`Уведомления о новых заказах ${c.yellowBright('включены')}.`, 'g');
    }
    if(settings.lotsRaiseNotification == true) {
        log(`Уведомления о поднятии лотов ${c.yellowBright('включены')}.`, 'g');
    }
    if(settings.deliveryNotification == true) {
        log(`Уведомления о выдаче товара ${c.yellowBright('включены')}.`, 'g');
    }
} else if (settings.telegramBot == true) {
    log(`Telegram бот не инициализирован, уведомления будут недоступны`, 'r');
}

// Callbacks
function onNewMessage() {
    processMessages();
}

function onNewIncomingMessage(message) {
    processIncomingMessages(message);
}

function onNewOrder() {
    if(settings.autoIssue == true) {
        checkForNewOrders();
    }

    if(settings.goodsStateCheck == true) {
        checkGoodsState();
    }
}

// Function to sync accounts to Google Sheets
async function syncAccountsToGoogleSheets() {
    try {
        // Check if Google Sheets integration is enabled and accounts sheet is configured
        if (!settings.googleSheetsFAQEnabled || !settings.googleSheetsAccountsSheetName) {
            return;
        }
        
        // Check if Google Sheets FAQ instance is available
        if (!global.googleSheetsFAQ) {
            log(`Google Sheets FAQ not initialized, skipping account sync`, 'c');
            return;
        }
        
        // Get all lots for sync
        const { getAllLotsForSync } = global.goods;
        if (!getAllLotsForSync) {
            log(`getAllLotsForSync function not available, skipping account sync`, 'c');
            return;
        }
        
        const accounts = await getAllLotsForSync();
        if (accounts && accounts.length > 0) {
            log(`Syncing ${accounts.length} accounts to Google Sheets`, 'c');
            await global.googleSheetsFAQ.syncAccountsToSheet(accounts);
        }
    } catch (err) {
        log(`Error syncing accounts to Google Sheets: ${err}`, 'r');
    }
}

// Start periodic account sync (every 30 minutes)
if (settings.googleSheetsFAQEnabled && settings.googleSheetsAccountsSheetName) {
    // Initial sync after 5 seconds
    setTimeout(syncAccountsToGoogleSheets, 5000);
    
    // Then sync every 30 minutes
    setInterval(syncAccountsToGoogleSheets, 30 * 60 * 1000);
}
