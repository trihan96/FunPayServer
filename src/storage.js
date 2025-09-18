// MODULES
const fs = global.fs_extra;
const c = global.chalk;
const inq = global.inquirer;
const ConfigParser = global.config_parser;
const log = global.log;
const { exit } = global.helpers;

// CONSTANTS
const _dirname = process.cwd();

const dataFolder = 'data';
const logsFolder = 'logs';
const configFolder = 'configs';
const otherFolder = 'other';

const dataPath = `${_dirname}/${dataFolder}`;
const logsPath = `${dataPath}/${logsFolder}`;
const configPath = `${dataPath}/${configFolder}`;
const otherPath = `${dataPath}/${otherFolder}`;

const config = new ConfigParser();

// START
await initStorage();
global.settings = await loadSettings();

// FUNCTIONS
async function initStorage() {
    try {
        const configFiles = [
            "delivery.json", 
            "autoResponse.json"
        ];

        const otherFiles = [
            "categories.json", 
            "categoriesCache.json", 
            "goodsState.json",
            "newChatUsers.json",
            "telegram.txt"
        ];
    
        if(!(await fs.exists(dataPath))) {
            await fs.mkdir(dataPath);
        }

        if(!(await fs.exists(logsPath))) {
            await fs.mkdir(logsPath);
        }

        if(!(await fs.exists(configPath))) {
            await fs.mkdir(configPath);
        }

        if(!(await fs.exists(otherPath))) {
            await fs.mkdir(otherPath);
        }
    
        for(let i = 0; i < configFiles.length; i++) {
            const file = configFiles[i];

            if(!(await fs.exists(`${configPath}/${file}`))) {
                await fs.writeFile(`${configPath}/${file}`, '[]');
            }
        }

        for(let i = 0; i < otherFiles.length; i++) {
            const file = otherFiles[i];

            if(!(await fs.exists(`${otherPath}/${file}`))) {
                await fs.writeFile(`${otherPath}/${file}`, '[]');
            }
        }
    } catch (err) {
        log(`Не удалось создать файлы хранилища: ${err}`);
    }
}

// Function to load JSON data from a file
async function load(filePath) {
    try {
        const fullPath = `${_dirname}/${filePath}`;
        if (await fs.exists(fullPath)) {
            const data = await fs.readFile(fullPath, 'utf8');
            return JSON.parse(data);
        } else {
            log(`Файл не найден: ${fullPath}`, 'y');
            return null;
        }
    } catch (err) {
        log(`Ошибка при загрузке файла ${filePath}: ${err.message}`, 'r');
        return null;
    }
}

// Function to update/write JSON data to a file
async function updateFile(data, filePath) {
    try {
        const fullPath = `${_dirname}/${filePath}`;
        const dirPath = fullPath.substring(0, fullPath.lastIndexOf('/'));
        
        // Create directory if it doesn't exist
        if (!(await fs.exists(dirPath))) {
            await fs.mkdir(dirPath, { recursive: true });
        }
        
        // Write data to file
        await fs.writeFile(fullPath, JSON.stringify(data, null, 4));
        return true;
    } catch (err) {
        log(`Ошибка при обновлении файла ${filePath}: ${err.message}`, 'r');
        return false;
    }
}

async function loadSettings() {
    try {
        let uri = `${_dirname}/settings.txt`;
        let settings = {};
        
        log(`Попытка загрузки настроек из файла: ${uri}`, 'c');
        
        if(!(await fs.exists(uri))) {
            log(`Файл настроек не найден: ${uri}`, 'r');
            const answers = await askSettings();

            settings = {
                golden_key: answers.golden_key,
                userAgent: answers.userAgent,
                alwaysOnline: answers.alwaysOnline,
                lotsRaise: answers.lotsRaise,
                goodsStateCheck: answers.goodsStateCheck, 
                autoIssue: answers.autoIssue, 
                autoResponse: answers.autoResponse,
                greetingMessage: answers.greetingMessage,
                greetingMessageText: answers.greetingMessageText,
                autoIssueTestCommand: 0,
                telegramBot: answers.telegramBot,
                telegramToken: answers.telegramToken,
                userName: answers.userName,
                newMessageNotification: answers.newMessageNotification,
                newOrderNotification: answers.newOrderNotification,
                lotsRaiseNotification: answers.lotsRaiseNotification,
                deliveryNotification: answers.deliveryNotification,
                followUpMessage: 0,
                followUpMessageText: 'Спасибо за покупку! После всех проверок зайдите пожалуйста в покупки и нажмите "подтвердить заказ" по ссылке https://funpay.com/orders/{order_id}/',
                watermark: "[ 🔥NightBot ]",
                telegramWatermark: "",
                googleSheetsFAQEnabled: 0,
                googleSheetsId: "",
                googleSheetsServiceAccountPath: "",
                googleSheetsRange: "A:B",
                googleSheetsGeminiApiKey: "",
                googleSheetsFeedbackSheetName: "Feedback",
                proxy: {
                    useProxy: 0,
                    host: "",
                    port: 3128,
                    login: "",
                    pass: "",
                    type: "http"
                },
                geminiSocks5Proxy: {
                    enabled: 0,
                    host: "",
                    port: 1080,
                    username: "",
                    password: ""
                }
            };

            await saveConfig(settings);
        } else {
            log(`Файл настроек найден: ${uri}`, 'g');
            settings = await loadConfig();
        }

        log(`Настройки загружены. autoIssueTestCommand: ${settings.autoIssueTestCommand}, autoResponse: ${settings.autoResponse}`, 'c');

        if(!checkGoldenKey(settings.golden_key)) {
            log('Невалидный токен (golden_key).', 'r');
            await exit();
        }

        return settings;
    } catch (err) {
        log(`Ошибка при загрузке файла настроек: ${err}. Программа будет закрыта.`, 'r');
        await exit();
    }
}

function loadConfig() {
    config.read(`${_dirname}/settings.txt`);
    
    // Add debugging to see what settings are being loaded
    log(`Загрузка настроек из файла: ${_dirname}/settings.txt`, 'c');
    
    let settings = {
        golden_key: config.get('FunPay', 'golden_key'),
        userAgent: config.get('FunPay', 'user_agent'),
        alwaysOnline: Number(config.get('FunPay', 'alwaysOnline')),
        lotsRaise: Number(config.get('FunPay', 'lotsRaise')),
        goodsStateCheck: Number(config.get('FunPay', 'goodsStateCheck')),
        autoIssue: Number(config.get('FunPay', 'autoDelivery')),
        autoResponse: Number(config.get('FunPay', 'autoResponse')),
        greetingMessage: Number(config.get('FunPay', 'greetingMessage')),
        greetingMessageText: replaceAll(config.get('FunPay', 'greetingMessageText'), '\\n', '\n'),
        autoIssueTestCommand: Number(config.get('FunPay', 'autoDeliveryTestCommand')),
        watermark: config.get('FunPay', 'waterMark'),
        telegramWatermark: config.get('FunPay', 'telegramWaterMark'),
        telegramBot: Number(config.get('Telegram', 'enabled')),
        telegramToken: config.get('Telegram', 'token'),
        userName: config.get('Telegram', 'userName'),
        newMessageNotification: Number(config.get('Telegram', 'newMessageNotification')),
        newOrderNotification: Number(config.get('Telegram', 'newOrderNotification')),
        lotsRaiseNotification: Number(config.get('Telegram', 'lotsRaiseNotification')),
        deliveryNotification: Number(config.get('Telegram', 'deliveryNotification')),
        followUpMessage: Number(config.get('FunPay', 'followUpMessage')),
        followUpMessageText: config.get('FunPay', 'followUpMessageText'),
        googleSheetsFAQEnabled: Number(config.get('FunPay', 'googleSheetsFAQEnabled')),
        googleSheetsId: config.get('FunPay', 'googleSheetsId'),
        googleSheetsServiceAccountPath: config.get('FunPay', 'googleSheetsServiceAccountPath'),
        googleSheetsRange: config.get('FunPay', 'googleSheetsRange'),
        googleSheetsGeminiApiKey: config.get('FunPay', 'googleSheetsGeminiApiKey'),
        googleSheetsFeedbackSheetName: config.get('FunPay', 'googleSheetsFeedbackSheetName'),
        googleSheetsContextSheetName: config.get('FunPay', 'googleSheetsContextSheetName'),
        googleSheetsAccountsSheetName: config.get('FunPay', 'googleSheetsAccountsSheetName'),
        messageBufferDelay: Number(config.get('FunPay', 'messageBufferDelay')) || 3000,
        maxBufferTime: Number(config.get('FunPay', 'maxBufferTime')) || 10000,
        proxy: {
            useProxy: Number(config.get('Proxy', 'enabled')),
            host: config.get('Proxy', 'host'),
            port: config.get('Proxy', 'port'),
            login: config.get('Proxy', 'login'),
            pass: config.get('Proxy', 'pass'),
            type: config.get('Proxy', 'type')
        },
        geminiSocks5Proxy: {
            enabled: Number(config.get('FunPay', 'geminiSocks5ProxyEnabled')),
            host: config.get('FunPay', 'geminiSocks5ProxyHost'),
            port: config.get('FunPay', 'geminiSocks5ProxyPort'),
            username: config.get('FunPay', 'geminiSocks5ProxyUsername'),
            password: config.get('FunPay', 'geminiSocks5ProxyPassword')
        }
    };
    
    // Log the loaded settings for debugging
    log(`Загруженные настройки: autoIssueTestCommand=${settings.autoIssueTestCommand}, autoResponse=${settings.autoResponse}`, 'c');
    log(`Buffer settings: messageBufferDelay=${settings.messageBufferDelay}, maxBufferTime=${settings.maxBufferTime}`, 'c');

    return settings;
}

function setValue(data, section, option, value) {
    if(data.includes(`[${section}]`)) {
        const sectionRegex = new RegExp(`\\[${section}\\][\\s\\S]*?(?=\\[|$)`, 'g');
        const sectionContent = data.match(sectionRegex)[0];
        const optionRegex = new RegExp(`${option}\\s*?:.*`, 'g');
        
        if(sectionContent.match(optionRegex)) {
            data = data.replace(optionRegex, `${option}: ${value}`);
        } else {
            data = data.replace(`[${section}]`, `[${section}]\n${option}: ${value}`);
        }
    } else {
        data += `\n[${section}]\n${option}: ${value}`;
    }

    return data;
}

async function saveConfig(settings) {
    let data = '';
    
    data = setValue(data, 'FunPay', 'golden_key', settings.golden_key);
    data = setValue(data, 'FunPay', 'user_agent', settings.userAgent);
    data = setValue(data, 'FunPay', 'alwaysOnline', settings.alwaysOnline);
    data = setValue(data, 'FunPay', 'lotsRaise', settings.lotsRaise);
    data = setValue(data, 'FunPay', 'goodsStateCheck', settings.goodsStateCheck);
    data = setValue(data, 'FunPay', 'autoDelivery', settings.autoIssue);
    data = setValue(data, 'FunPay', 'autoResponse', settings.autoResponse);
    data = setValue(data, 'FunPay', 'greetingMessage', settings.greetingMessage);
    data = setValue(data, 'FunPay', 'greetingMessageText', settings.greetingMessageText.replaceAll('\n', '\\n'));
    data = setValue(data, 'FunPay', 'autoDeliveryTestCommand', settings.autoIssueTestCommand);
    data = setValue(data, 'FunPay', 'followUpMessage', settings.followUpMessage);
    data = setValue(data, 'FunPay', 'followUpMessageText', settings.followUpMessageText);
    data = setValue(data, 'FunPay', 'waterMark', settings.watermark);
    data = setValue(data, 'FunPay', 'telegramWaterMark', settings.telegramWatermark);
    data = setValue(data, 'FunPay', 'googleSheetsFAQEnabled', settings.googleSheetsFAQEnabled);
    data = setValue(data, 'FunPay', 'googleSheetsId', settings.googleSheetsId);
    data = setValue(data, 'FunPay', 'googleSheetsServiceAccountPath', settings.googleSheetsServiceAccountPath);
    data = setValue(data, 'FunPay', 'googleSheetsRange', settings.googleSheetsRange);
    data = setValue(data, 'FunPay', 'googleSheetsGeminiApiKey', settings.googleSheetsGeminiApiKey);
    data = setValue(data, 'FunPay', 'googleSheetsFeedbackSheetName', settings.googleSheetsFeedbackSheetName);
    data = setValue(data, 'FunPay', 'googleSheetsContextSheetName', settings.googleSheetsContextSheetName);
    data = setValue(data, 'FunPay', 'googleSheetsAccountsSheetName', settings.googleSheetsAccountsSheetName);
    data = setValue(data, 'FunPay', 'messageBufferDelay', settings.messageBufferDelay);
    data = setValue(data, 'FunPay', 'maxBufferTime', settings.maxBufferTime);
    data = setValue(data, 'Telegram', 'enabled', settings.telegramBot);
    data = setValue(data, 'Telegram', 'token', settings.telegramToken);
    data = setValue(data, 'Telegram', 'userName', settings.userName);
    data = setValue(data, 'Telegram', 'newMessageNotification', settings.newMessageNotification);
    data = setValue(data, 'Telegram', 'newOrderNotification', settings.newOrderNotification);
    data = setValue(data, 'Telegram', 'lotsRaiseNotification', settings.lotsRaiseNotification);
    data = setValue(data, 'Telegram', 'deliveryNotification', settings.deliveryNotification);
    data = setValue(data, 'Proxy', 'enabled', settings.proxy.useProxy);
    data = setValue(data, 'Proxy', 'host', settings.proxy.host);
    data = setValue(data, 'Proxy', 'port', settings.proxy.port);
    data = setValue(data, 'Proxy', 'login', settings.proxy.login);
    data = setValue(data, 'Proxy', 'pass', settings.proxy.pass);
    data = setValue(data, 'Proxy', 'type', settings.proxy.type);
    data = setValue(data, 'FunPay', 'geminiSocks5ProxyEnabled', settings.geminiSocks5Proxy.enabled);
    data = setValue(data, 'FunPay', 'geminiSocks5ProxyHost', settings.geminiSocks5Proxy.host);
    data = setValue(data, 'FunPay', 'geminiSocks5ProxyPort', settings.geminiSocks5Proxy.port);
    data = setValue(data, 'FunPay', 'geminiSocks5ProxyUsername', settings.geminiSocks5Proxy.username);
    data = setValue(data, 'FunPay', 'geminiSocks5ProxyPassword', settings.geminiSocks5Proxy.password);

    await fs.writeFile(`${_dirname}/settings.txt`, data);
}

function checkGoldenKey(golden_key) {
    return /^[a-z0-9]{32}$/.test(golden_key);
}

async function loadAutoIssueFile() {
    return await fs.readFile(`${_dirname}/data/configs/delivery.json`, 'utf8');
}

function replaceAll(string, find, replace) {
    while(string.includes(find)) string = string.replace(find, replace);
    return string;
}

async function askSettings() {
    const question1 = await inq.prompt([{
        name: 'golden_key',
        type: 'input',
        message: `Введите golden_key. Его можно получить из cookie с сайта FunPay при помощи расширения EditThisCookie:`,
        validate: function (input) {
            const done = this.async();
        
            if (!checkGoldenKey(input)) {
                done('Невалидный токен (golden_key).');
                return;
            }

            done(null, true);
        }
    },
    {
        name: 'userAgent',
        type: 'input',
        message: `Введите User-Agent браузера, с которого выполнялся вход на сайт FunPay. Его можно получить тут: https://bit.ly/3l48x8b`
    }]);

    const question2 = await inq.prompt({
        name: 'autoSettings',
        type: 'list',
        message: `Запуск бота выполняется впервые. Вы хотите настроить функции бота или оставить все параметры по умолчанию? Эти параметры всегда можно поменять в файле ${c.yellowBright('settings.txt')}:`,
        choices: ['Оставить по умолчанию', 'Настроить']
    });

    let telegramToken = '';

    if(question2.autoSettings == 'Оставить по умолчанию') {
        console.log();
        return {
            golden_key: question1.golden_key,
            userAgent: question1.userAgent,
            telegramBot: 0,
            telegramToken: telegramToken,
            userName: 'MyTelegramLogin',
            alwaysOnline: 1,
            lotsRaise: 1,
            goodsStateCheck: 1,
            autoIssue: 1,
            autoResponse: 1,
            newMessageNotification: 1,
            newOrderNotification: 1,
            lotsRaiseNotification: 1,
            deliveryNotification: 1,
            followUpMessage: 0,
            followUpMessageText: 'Спасибо за покупку! После всех проверок зайдите пожалуйста в покупки и нажмите "подтвердить заказ" по ссылке https://funpay.com/orders/{order_id}/',
            greetingMessage: 1,
            greetingMessageText: 'Привет! Продавец скоро ответит на твоё сообщение.',
            googleSheetsGeminiApiKey: "",
            googleSheetsFeedbackId: ""
        }
    }

    const question3 = await inq.prompt([{
        name: 'alwaysOnline',
        type: 'list',
        message: 'Всегда онлайн:',
        choices: ['Включить', 'Выключить'],
        default: 'Включить'
    },
    {
        name: 'lotsRaise',
        type: 'list',
        message: 'Автоподнятие лотов:',
        choices: ['Включить', 'Выключить'],
        default: 'Включить'
    },
    {
        name: 'goodsStateCheck',
        type: 'list',
        message: 'Автоактивация лотов после продажи:',
        choices: ['Включить', 'Выключить'],
        default: 'Включить'
    },
    {
        name: 'autoIssue',
        type: 'list',
        message: 'Автовыдача товаров:',
        choices: ['Включить', 'Выключить'],
        default: 'Включить'
    },
    {
        name: 'autoResponse',
        type: 'list',
        message: 'Автоответ:',
        choices: ['Включить', 'Выключить'],
        default: 'Включить'
    },
    {
        name: 'greetingMessage',
        type: 'list',
        message: 'Приветственное сообщение:',
        choices: ['Включить', 'Выключить'],
        default: 'Выключить'
    },
    {
        name: 'telegramBot',
        type: 'list',
        message: 'Telegram бот:',
        choices: ['Включить', 'Выключить'],
        default: 'Выключить'
    }]);

    if(question3.telegramBot == 'Включить') {
        const question4 = await inq.prompt([{
            name: 'telegramToken',
            type: 'input',
            message: 'Введите токен Telegram бота (получить у @BotFather):'
        },
        {
            name: 'userName',
            type: 'input',
            message: 'Введите свой ник (логин) в Telegram без @:'
        }]);

        telegramToken = question4.telegramToken;
        userName = question4.userName;
    }

    console.log();
    return {
        golden_key: question1.golden_key,
        userAgent: question1.userAgent,
        telegramBot: question3.telegramBot == 'Включить' ? 1 : 0,
        telegramToken: telegramToken,
        userName: userName || 'MyTelegramLogin',
        alwaysOnline: question3.alwaysOnline == 'Включить' ? 1 : 0,
        lotsRaise: question3.lotsRaise == 'Включить' ? 1 : 0,
        goodsStateCheck: question3.goodsStateCheck == 'Включить' ? 1 : 0,
        autoIssue: question3.autoIssue == 'Включить' ? 1 : 0,
        autoResponse: question3.autoResponse == 'Включить' ? 1 : 0,
        greetingMessage: question3.greetingMessage == 'Включить' ? 1 : 0,
        greetingMessageText: 'Привет! Продавец скоро ответит на твоё сообщение.',
        newMessageNotification: 1,
        newOrderNotification: 1,
        lotsRaiseNotification: 1,
        deliveryNotification: 1,
        followUpMessage: 0,
        followUpMessageText: 'Спасибо за покупку! После всех проверок зайдите пожалуйста в покупки и нажмите "подтвердить заказ" по ссылке https://funpay.com/orders/{order_id}/',
        googleSheetsGeminiApiKey: ""
    }
}

// Constants storage
const constants = {
    api: 'https://funpay.com',
    chatId: null
};

// Function to get constant values
function getConst(key) {
    return constants[key];
}

// Function to set constant values
function setConst(key, value) {
    constants[key] = value;
}

// Export functions
export { 
    loadSettings, 
    loadConfig, 
    saveConfig, 
    checkGoldenKey, 
    loadAutoIssueFile, 
    replaceAll, 
    askSettings, 
    load,
    updateFile,
    getConst, 
    setConst 
};