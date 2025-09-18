const logTime = true;
let time = Date.now();

if(logTime) console.log('Loading modules...');

// Node Modules
let t = Date.now();
global.fs_extra = (await import('fs-extra')).default;
if(logTime) console.log(`FS Extra loaded in ${Date.now() - t}ms.`);

t = Date.now();
global.https = (await import('https')).default;
if(logTime) console.log(`HTTPS loaded in ${Date.now() - t}ms.`);

t = Date.now();
global.dns = (await import('dns/promises')).default;
if(logTime) console.log(`DNS loaded in ${Date.now() - t}ms.`);

t = Date.now();
global.chalk = (await import('chalk')).default;
if(logTime) console.log(`Chalk loaded in ${Date.now() - t}ms.`);

t = Date.now();
global.node_html_parser = (await import('node-html-parser')).parse;
if(logTime) console.log(`Node HTML Parser loaded in ${Date.now() - t}ms.`);

if(!(await global.fs_extra.exists('./settings.txt'))) {
    t = Date.now();
    global.inquirer = (await import('inquirer')).default;
    if(logTime) console.log(`Inquirer loaded in ${Date.now() - t}ms.`);
} else {
    global.inquirer = null;
}

t = Date.now();
global.config_parser = (await import('configparser')).default;
if(logTime) console.log(`Configparser loaded in ${Date.now() - t}ms.`);

t = Date.now();
global.node_fetch = (await import('node-fetch')).default;
if(logTime) console.log(`Node Fetch loaded in ${Date.now() - t}ms.`);

t = Date.now();
global.https_proxy_agent = (await import('https-proxy-agent')).default;
if(logTime) console.log(`HTTPS Proxy Agent loaded in ${Date.now() - t}ms.`);

t = Date.now();
global.telegraf = (await import('telegraf')).Telegraf;
if(logTime) console.log(`Telegraf loaded in ${Date.now() - t}ms.`);

t = Date.now();
global.telegram_keyboard = (await import('telegram-keyboard')).Keyboard;
if(logTime) console.log(`Telegram Keyboard loaded in ${Date.now() - t}ms.`);

t = Date.now();
global.clone = (await import('clone')).default;
if(logTime) console.log(`Clone loaded in ${Date.now() - t}ms.`);

if(logTime) console.log(`Modules loaded in ${Date.now() - time}ms.`);

// Clear console
process.stdout.write("\u001b[2J\u001b[0;0H");

// Project Modules
// Base
global.log = (await import('./log.js')).default;
global.helpers = await import('./helpers.js');
const storageModule = await import('./storage.js');
global.storage = storageModule;
global.fetch = (await import('./fetch.js')).default;
global.DOMParser = (await import('./DOMParser.js')).default;

// Functional modules
global.raise = await import('./raise.js');
global.account = await import('./account.js');
global.categories = await import('./categories.js');
global.goods = await import('./goods.js');
global.activity = await import('./activity.js');
global.sales = await import('./sales.js');
global.chat = await import('./chat.js');

log(`Загрузка модуля googlesheets.js`, 'c');
try {
    global.googlesheets = await import('./googlesheets.js');
    log(`Модуль googlesheets.js успешно загружен`, 'g');
    log(`Содержимое модуля: ${Object.keys(global.googlesheets).join(', ')}`, 'c');
} catch (err) {
    log(`Ошибка при загрузке модуля googlesheets.js: ${err}`, 'r');
    log(`Стек ошибки: ${err.stack}`, 'r');
}

// Initialize Google Sheets FAQ module if enabled in settings
if (global.settings && global.settings.googleSheetsFAQEnabled) {
    log(`Google Sheets FAQ включен в настройках, инициализация модуля`, 'c');
    log(`Настройки Google Sheets:`, 'c');
    log(`  googleSheetsId: ${global.settings.googleSheetsId}`, 'c');
    log(`  googleSheetsServiceAccountPath: ${global.settings.googleSheetsServiceAccountPath}`, 'c');
    log(`  googleSheetsRange: ${global.settings.googleSheetsRange}`, 'c');
    log(`  googleSheetsFeedbackSheetName: ${global.settings.googleSheetsFeedbackSheetName}`, 'c');
    log(`  googleSheetsGeminiApiKey: ${global.settings.googleSheetsGeminiApiKey ? 'SET' : 'NOT SET'}`, 'c');
    
    // Validate required settings
    if (global.settings.googleSheetsId && global.settings.googleSheetsServiceAccountPath) {
        try {
            if (global.googlesheets && global.googlesheets.default) {
                const GoogleSheetsFAQ = global.googlesheets.default;
                log(`Создание экземпляра GoogleSheetsFAQ при запуске`, 'c');
                
                global.googleSheetsFAQ = new GoogleSheetsFAQ(
                    global.settings.googleSheetsId,
                    global.settings.googleSheetsServiceAccountPath,
                    global.settings.googleSheetsRange || 'FAQ!A:B',
                    global.settings.googleSheetsGeminiApiKey || null,
                    global.settings.googleSheetsFeedbackSheetName || 'Feedback'
                );
                
                log(`Экземпляр GoogleSheetsFAQ создан при запуске, загрузка данных FAQ`, 'c');
                
                // Try to load FAQ data
                const faqLoaded = await global.googleSheetsFAQ.refreshFAQData();
                if (faqLoaded) {
                    log(`Google Sheets FAQ успешно инициализирован при запуске. Загружено ${global.googleSheetsFAQ.getFAQData().length} записей.`, 'g');
                } else {
                    log(`Не удалось загрузить данные из Google Sheets FAQ при запуске. Модуль будет инициализирован позже при первом запросе.`, 'y');
                }
            } else {
                log(`Модуль googlesheets не доступен для инициализации при запуске`, 'r');
            }
        } catch (initErr) {
            log(`Ошибка при инициализации Google Sheets FAQ при запуске: ${initErr}`, 'r');
            log(`Стек ошибки: ${initErr.stack}`, 'r');
            global.googleSheetsFAQ = null; // Ensure it's null on error
        }
    } else {
        log(`Не заданы обязательные параметры Google Sheets для инициализации при запуске`, 'r');
        log(`  googleSheetsId: ${global.settings.googleSheetsId || 'NOT SET'}`, 'r');
        log(`  googleSheetsServiceAccountPath: ${global.settings.googleSheetsServiceAccountPath || 'NOT SET'}`, 'r');
    }
} else {
    log(`Google Sheets FAQ отключен в настройках`, 'c');
}

// Loops
global.runner = (await import('./runner.js')).default;
global.telegram = (await import('./telegram.js')).default;

// Export statement
let moduleExport;
export { moduleExport as a };