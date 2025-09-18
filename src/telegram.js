const c = global.chalk;
const Telegraf = global.telegraf;
const Keyboard = global.telegram_keyboard;
const { setConst, load, updateFile, getConst } = global.storage;
const log = global.log;
const fs = global.fs_extra;

class TelegramBot {
    constructor(token) {
        this.bot = new Telegraf(token);
        this.pendingFeedbackAction = null; // Store pending feedback actions

        process.once('SIGINT', () => this.bot.stop('SIGINT'));
        process.once('SIGTERM', () => this.bot.stop('SIGTERM'));
        this.bot.catch((err) => {
            log(`Ошибка бота telegram: ${err}`, 'r');
        })
    }

    async run() {
        try {
            this.setupListeners();
            await this.setupBot();

            this.bot.launch();
            log(`Управление через telegram бота ${c.yellowBright(this.botInfo.username)} запущено.`, 'g');
            
            // Log bot information for debugging
            log(`Telegram Bot Info: Username=${this.botInfo.username}, ID=${this.botInfo.id}`, 'c');
            if(global.storage && global.storage.getConst) {
                const chatId = global.storage.getConst('chatId');
                log(`Current Chat ID: ${chatId}`, 'c');
            }
        } catch (error) {
            log(`Ошибка запуска Telegram бота: ${error}`, 'r');
        }
    }

    async setupBot() {
        this.botInfo = await this.bot.telegram.getMe();
        this.bot.options.username = this.botInfo.username;

        this.mainKeyboard = this.getMainKeyboard();
        this.editGoodsKeyboard = this.getEditGoodsKeyboard();
        this.editAutoResponseKeyboard = this.getEditAutoResponseKeyboard();
        this.editSettingsKeyboard = this.getEditSettingsKeyboard();
        this.selectIssueTypeKeyboard = this.getSelectIssueTypeKeyboard();
        this.backKeyboard = this.getBackKeyboard();
        this.feedbackKeyboard = this.getFeedbackKeyboard(); // Add feedback keyboard

        this.waitingForLotDelete = false;
        this.waitingForLotName = false;
        this.waitingForLotContent = false;
        this.waitingForDeliveryFile = false;
        this.waitingForReply = false;
        this.waitingForAutoResponsePatterns = false;
        this.waitingForAutoResponseResponses = false;
        this.waitingForAutoResponseDelete = false;
        this.waitingForAutoResponseFile = false;
        this.waitingForSettingsFile = false;
        this.waitingForSettingValue = false;
        this.waitingForFeedbackAction = false; // Add feedback action flag

        this.lotType = '';
        this.lotName = '';
        this.lotContent = '';
        this.products = [];
        
        this.currentAutoResponse = {
            patterns: [],
            responses: []
        };
        
        // Store active conversations for reply functionality
        this.activeChats = new Map(); // Map: messageId -> {userName, node, time}
    }

    setupListeners() {
        this.bot.on('text', (ctx) => this.onMessage(ctx));
        this.bot.on('document', (ctx) => this.onMessage(ctx));
        this.bot.on('inline_query', (ctx) => this.onInlineQuery(ctx));
        this.bot.on('callback_query', (ctx) => this.onCallbackQuery(ctx));
    }
    
    async onMessage(ctx) {
        try {
            const msg = ctx.update.message.text;
            
            if(!this.isUserAuthed(ctx)) {
                ctx.reply('Привет! 😄\nДля авторизации введи свой ник в настройках FunPay Server, после чего перезапусти бота.');
                return;
            }
    
            // Handle feedback actions
            if(this.waitingForFeedbackAction && msg && global.googleSheetsFAQ) {
                await this.handleFeedbackAction(ctx, msg);
                return;
            }
    
            if(msg == '🔥 Статус 🔥') {
                this.replyStatus(ctx);
                return;
            }
    
            if(msg == '🚀 Редактировать автовыдачу 🚀') {
                this.editAutoIssue(ctx);
                return;
            }

            if(msg == '🤖 Редактировать автоответы 🤖') {
                await this.editAutoResponse(ctx);
                return;
            }

            if(msg == '⚙️ Редактировать настройки ⚙️') {
                await this.editSettings(ctx);
                return;
            }

            if(msg == '❔ Инфо ❔') {
                this.getInfo(ctx);
                return;
            }

            if(msg == '📊 Управление обратной связью 📊') {
                await this.manageFeedback(ctx);
                return;
            }

            if(msg == '📋 Просмотреть ожидающие ответы 📋') {
                await this.viewPendingResponses(ctx);
                return;
            }

            if(msg == '☑️ Добавить товар ☑️') {
                this.addProduct(ctx);
                return;
            }

            if(msg == '📛 Удалить товар 📛') {
                this.removeProduct(ctx);
                return;
            }

            if(msg == 'Инструкция (выдача одного и того же текста)') {
                this.lotType = 'instruction';
                this.addProductName(ctx);
                return;
            }

            if(msg == 'Аккаунты (выдача разных текстов по очереди)') {
                this.lotType = 'accounts';
                this.addProductName(ctx);
                return;
            }

            if(msg == '⬇️ Получить файл автовыдачи ⬇️') {
                await this.getAutoIssueFile(ctx);
                return;
            }

            if(msg == '⬆️ Загрузить файл автовыдачи ⬆️') {
                this.uploadAutoIssueFile(ctx);
                return;
            }

            // Auto-response editing buttons
            if(msg == '➕ Добавить автоответ ➕') {
                this.addAutoResponse(ctx);
                return;
            }

            if(msg == '❌ Удалить автоответ ❌') {
                this.removeAutoResponse(ctx);
                return;
            }

            if(msg == '📄 Посмотреть все автоответы 📄') {
                await this.viewAllAutoResponses(ctx);
                return;
            }

            if(msg == '⬇️ Получить файл autoResponse.json ⬇️') {
                await this.getAutoResponseFile(ctx);
                return;
            }

            if(msg == '⬆️ Загрузить файл autoResponse.json ⬆️') {
                this.uploadAutoResponseFile(ctx);
                return;
            }

            // Settings editing buttons
            if(msg == '🔄 Показать настройки 🔄') {
                await this.showSettings(ctx);
                return;
            }

            if(msg == '✏️ Изменить настройку ✏️') {
                this.changeSettingValue(ctx);
                return;
            }

            if(msg == '⬇️ Получить файл settings.txt ⬇️') {
                await this.getSettingsFile(ctx);
                return;
            }

            if(msg == '⬆️ Загрузить файл settings.txt ⬆️') {
                this.uploadSettingsFile(ctx);
                return;
            }

            // Restart confirmation buttons
            if(msg == '✅ Да, перезапустить') {
                ctx.reply('❌ Перезапуск недоступен.', this.mainKeyboard.reply());
                return;
            }

            if(msg == '❌ Отмена') {
                ctx.reply('❌ Отмена.', this.mainKeyboard.reply());
                return;
            }

            if(msg == '🔙 Назад 🔙') {
                await this.back(ctx);
                return;
            }

            if(this.waitingForLotName) {
                await this.saveLotName(ctx);
                return;
            }

            if(this.waitingForLotContent) {
                await this.saveLotContent(ctx);
                return;
            }

            if(this.waitingForLotDelete) {
                await this.deleteLot(ctx);
                return;
            }

            if(this.waitingForDeliveryFile) {
                await this.onUploadDeliveryFile(ctx);
                return;
            }
            
            if(this.waitingForReply) {
                await this.handleReplyMessage(ctx);
                return;
            }
            
            if(this.waitingForAutoResponsePatterns) {
                await this.saveAutoResponsePatterns(ctx);
                return;
            }
            
            if(this.waitingForAutoResponseResponses) {
                await this.saveAutoResponseResponses(ctx);
                return;
            }
            
            if(this.waitingForAutoResponseDelete) {
                await this.deleteAutoResponse(ctx);
                return;
            }
            
            if(this.waitingForAutoResponseFile) {
                await this.onUploadAutoResponseFile(ctx);
                return;
            }
            
            if(this.waitingForSettingsFile) {
                await this.onUploadSettingsFile(ctx);
                return;
            }
            
            if(this.waitingForSettingValue) {
                await this.handleSettingValueChange(ctx);
                return;
            }
            
            // Check if this is a reply command
            if(msg && msg.startsWith('/reply_')) {
                await this.startReplyToUser(ctx, msg);
                return;
            }
            
            // Auto-response pause management commands
            if(msg && msg.startsWith('/pause ')) {
                await this.handlePauseCommand(ctx, msg);
                return;
            }
            
            if(msg && msg.startsWith('/unpause ')) {
                await this.handleUnpauseCommand(ctx, msg);
                return;
            }
            
            if(msg === '/pauselist') {
                await this.handlePauseListCommand(ctx);
                return;
            }

            this.waitingForLotName = false;
            this.waitingForLotContent = false;
            this.waitingForLotDelete = false;
            this.waitingForDeliveryFile = false;
            this.waitingForReply = false;
            this.waitingForAutoResponsePatterns = false;
            this.waitingForAutoResponseResponses = false;
            this.waitingForAutoResponseDelete = false;
            this.waitingForAutoResponseFile = false;
            this.waitingForSettingsFile = false;
            this.waitingForSettingValue = false;
            this.waitingForFeedbackAction = false; // Reset feedback action flag
                    
            this.currentAutoResponse = {
                patterns: [],
                responses: []
            };
            
            ctx.reply('🏠 Меню', this.mainKeyboard.reply());
        } catch (err) {
            log(`Ошибка при обработке telegram сообщения: ${err}`, 'r');
            ctx.reply(`Воу! Я словил ошибку... Хз как так получилось, но вот всё, что мне известно: ${err}`, this.mainKeyboard.reply());
        }
    }

    isUserAuthed(ctx) {
        if(global.settings.userName == ctx.update.message.from.username) {
            if(!getConst('chatId')) setConst('chatId', ctx.update.message.chat.id);
            return true;
        }
        return false;
    }

    getMainKeyboard() {
        const keyboard = Keyboard.make([
            ['❔ Инфо ❔', '🔥 Статус 🔥'],
            ['🚀 Редактировать автовыдачу 🚀'],
            ['🤖 Редактировать автоответы 🤖'],
            ['📊 Управление обратной связью 📊'],
            ['⚙️ Редактировать настройки ⚙️']
        ]);

        return keyboard;
    }

    getEditGoodsKeyboard() {
        const keyboard = Keyboard.make([
            ['☑️ Добавить товар ☑️', '📛 Удалить товар 📛'],
            ['⬇️ Получить файл автовыдачи ⬇️', '⬆️ Загрузить файл автовыдачи ⬆️'],
            ['🔙 Назад 🔙']
        ]);

        return keyboard;
    }

    getEditAutoResponseKeyboard() {
        const keyboard = Keyboard.make([
            ['➕ Добавить автоответ ➕', '❌ Удалить автоответ ❌'],
            ['📄 Посмотреть все автоответы 📄'],
            ['⬇️ Получить файл autoResponse.json ⬇️'],
            ['⬆️ Загрузить файл autoResponse.json ⬆️'],
            ['🔙 Назад 🔙']
        ]);

        return keyboard;
    }

    getEditSettingsKeyboard() {
        const keyboard = Keyboard.make([
            ['🔄 Показать настройки 🔄', '✏️ Изменить настройку ✏️'],
            ['⬇️ Получить файл settings.txt ⬇️'],
            ['⬆️ Загрузить файл settings.txt ⬆️'],
            ['🔙 Назад 🔙']
        ]);

        return keyboard;
    }

    getFeedbackKeyboard() {
        const keyboard = Keyboard.make([
            ['📋 Просмотреть ожидающие ответы 📋'],
            ['🔙 Назад 🔙']
        ]);

        return keyboard;
    }

    getSelectIssueTypeKeyboard() {
        const keyboard = Keyboard.make([
            ['Инструкция (выдача одного и того же текста)'],
            ['Аккаунты (выдача разных текстов по очереди)'],
            ['🔙 Назад 🔙']
        ]);

        return keyboard;
    }

    getBackKeyboard() {
        const keyboard = Keyboard.make([
            ['🔙 Назад 🔙']
        ]);

        return keyboard;
    }

    async replyStatus(ctx) {
        const time = Date.now();
        const workTimeDiff = time - global.startTime;
        const lastUpdateTimeDiff = time - global.appData.lastUpdate;

        function declensionNum(num, words) {
            return words[(num % 100 > 4 && num % 100 < 20) ? 2 : [2, 0, 1, 1, 1, 2][(num % 10 < 5) ? num % 10 : 5]];
        }

        function msToTime(ms) {
            let days = ms > 0 ? Math.floor(ms / 1000 / 60 / 60 / 24) : 0;
            let hours = ms > 0 ? Math.floor(ms / 1000 / 60 / 60) % 24 : 0;
            let minutes = ms > 0 ? Math.floor(ms / 1000 / 60) % 60 : 0;
            let seconds = ms > 0 ? Math.floor(ms / 1000) % 60 : 0;
            days = ms < 10 ? '0' + days : days;
            hours = hours < 10 ? '0' + hours : hours;
            minutes = minutes < 10 ? '0' + minutes : minutes;
            seconds = seconds < 10 ? '0' + seconds : seconds;
            const daysTitle = declensionNum(days, ['день', 'дня', 'дней']);
            const hoursTitle = declensionNum(hours, ['час', 'часа', 'часов']);
            const minutesTitle = declensionNum(minutes, ['минута', 'минуты', 'минут']);
            const secondsTitle = declensionNum(seconds, ['секунда', 'секунды', 'секунд']);
            return {days: days, hours: hours, minutes: minutes, seconds: seconds, daysTitle: daysTitle, hoursTitle: hoursTitle, minutesTitle: minutesTitle, secondsTitle: secondsTitle};
        }

        const workTimeArr = msToTime(workTimeDiff);
        const workTime = `${workTimeArr.days} ${workTimeArr.daysTitle} ${workTimeArr.hours} ${workTimeArr.hoursTitle} ${workTimeArr.minutes} ${workTimeArr.minutesTitle} ${workTimeArr.seconds} ${workTimeArr.secondsTitle}`;

        const lastUpdateTimeArr = msToTime(lastUpdateTimeDiff);
        const lastUpdateTime = `${lastUpdateTimeArr.minutes} ${lastUpdateTimeArr.minutesTitle} ${lastUpdateTimeArr.seconds} ${lastUpdateTimeArr.secondsTitle}`;

        const autoIssue = (global.settings.autoIssue) ? 'Вкл' : 'Выкл';
        const alwaysOnline = (global.settings.alwaysOnline) ? 'Вкл' : 'Выкл';
        const lotsRaise = (global.settings.lotsRaise) ? 'Вкл' : 'Выкл';
        const goodsStateCheck = (global.settings.goodsStateCheck) ? 'Вкл' : 'Выкл';
        const autoResponse = (global.settings.autoResponse) ? 'Вкл' : 'Выкл';

        const msg = `🔥 <b>Статус</b> 🔥\n\n🔑 Аккаунт: <code>${global.appData.userName}</code>\n💰 Баланс: <code>${global.appData.balance}</code>\n🛍️ Продажи: <code>${global.appData.sales}</code>\n♻️ Последнее обновление: <code>${lastUpdateTime} назад</code>\n\n🕒 Время работы: <code>${workTime}</code>\n⏲ Всегда онлайн: <code>${alwaysOnline}</code>\n👾 Автоответ: <code>${autoResponse}</code>\n🚀 Автовыдача: <code>${autoIssue}</code>\n🏆 Автоподнятие предложений: <code>${lotsRaise}</code>\n🔨 Автовосстановление предложений: <code>${goodsStateCheck}</code>\n\n<i><a href="https://t.me/fplite">FunPayServer</a></i>`;
        const params = this.mainKeyboard.reply();
        params.disable_web_page_preview = true;
        ctx.replyWithHTML(msg, params);
    }

    async editAutoIssue(ctx) {
        try {
            const goods = await load('data/configs/delivery.json');
            let goodsStr = '';

            let msg = `📄 <b>Список товаров</b> 📄`;
            await ctx.replyWithHTML(msg, this.editGoodsKeyboard.reply());
    
            for(let i = 0; i < goods.length; i++) {
                goodsStr += `[${i + 1}] ${goods[i].name}\n`;
    
                if(goodsStr.length > 3000) {
                    await ctx.replyWithHTML(goodsStr, this.editGoodsKeyboard.reply());
                    goodsStr = '';
                }

                if(i == (goods.length - 1)) {
                    await ctx.replyWithHTML(goodsStr, this.editGoodsKeyboard.reply());
                }
            }
        } catch (err) {
            log(`Ошибка при выдаче списка товаров: ${err}`, 'r');
        }
    }

    getInfo(ctx) {
        const msg = `❔ <b>FunPayServer</b> ❔\n\n<b>FunPayServer</b> - это бот для площадки funpay.com с открытым исходным кодом, разработанный <b>NightStranger</b>.\n\nБольшое спасибо всем, кто поддерживает данный проект ❤️. Он живёт благодаря вам.\n\n<a href="https://github.com/NightStrang6r/FunPayServer">GitHub</a> | <a href="https://github.com/NightStrang6r/FunPayServer">Поддержать проект</a>`;
        ctx.replyWithHTML(msg);
    }

    addProduct(ctx) {
        ctx.replyWithHTML(`Выбери тип предложения`, this.selectIssueTypeKeyboard.reply());
    }

    addProductName(ctx) {
        ctx.replyWithHTML(`Окей, отправь мне название предложения. Можешь просто скопирвать его из funpay. Эмодзи в названии поддерживаются.`);
        this.waitingForLotName = true;
    }

    removeProduct(ctx) {
        ctx.replyWithHTML(`Введи номер товара, который нужно удалить из списка автовыдачи.`);
        this.waitingForLotDelete = true;
    }

    async back(ctx) {
        this.waitingForLotName = false;
        this.waitingForLotContent = false;
        this.waitingForLotDelete = false;
        this.waitingForDeliveryFile = false;

        if(this.products.length > 0) {
            let goods = await load('data/configs/delivery.json');

            const product = {
                "name": this.lotName,
                "nodes": this.products
            }

            goods.push(product);
            await updateFile(goods, 'data/configs/delivery.json');
            this.products = [];
        }

        ctx.reply('🏠 Меню', this.mainKeyboard.reply());
    }

    async saveLotName(ctx) {
        const msg = ctx.update.message.text;

        this.waitingForLotName = false;
        this.lotName = msg;

        let replyMessage = 'Понял-принял. Теперь отправь мне сообщение, которое будет выдано покупателю после оплаты.';
        if(this.lotType == 'accounts') {
            replyMessage = 'Понял-принял. Теперь отправь мне сообщение, которое будет выдано покупателю после оплаты. Ты можешь отправить несколько сообщений. Каждое сообщение будет выдано после каждой покупки. Нажми "🔙 Назад 🔙" когда закончишь заполнять товар.';
        }

        ctx.reply(replyMessage, this.backKeyboard.reply());
        this.waitingForLotContent = true;
    }

    async saveLotContent(ctx) {
        const msg = ctx.update.message.text;

        this.lotContent = msg;
        let keyboard = this.backKeyboard;
        let goods = await load('data/configs/delivery.json');

        if(this.lotType != 'accounts') {
            this.waitingForLotContent = false;
            keyboard = this.mainKeyboard;

            const product = {
                "name": this.lotName,
                "message": this.lotContent
            }
    
            goods.push(product);
            await updateFile(goods, 'data/configs/delivery.json');

            this.lotName = '';
            this.lotContent = '';
        } else {
            keyboard = this.backKeyboard;

            this.products.push(msg);
        }

        ctx.reply(`Окей, сохранил товар.`, keyboard.reply());
    }

    async deleteLot(ctx) {
        const msg = ctx.update.message.text;
        this.waitingForLotDelete = false;

        let num = Number(msg);
        if(isNaN(num)) {
            ctx.reply(`Что-то это не похоже на число... Верну тебя в меню.`, this.mainKeyboard.reply());
            return;
        }

        let goods = await load('data/configs/delivery.json');
        if(num > goods.length || num < 0) {
            ctx.reply(`Такого id нет в списке автовыдачи. Верну тебя в меню.`, this.mainKeyboard.reply());
            return;
        }

        let name = goods[num - 1].name;
        goods.splice(num - 1, 1);
        await updateFile(goods, 'data/configs/delivery.json');

        ctx.reply(`Ок, удалил товар "${name}" из списка автовыдачи.`, this.mainKeyboard.reply());
    }

    async getAutoIssueFile(ctx) {
        let contents = getConst('autoIssueFilePath');

        ctx.replyWithDocument({
            source: contents,
            filename: 'delivery.json'
        }).catch(function(error) { log(error); })
    }

    uploadAutoIssueFile(ctx) {
        this.waitingForDeliveryFile = true;
        ctx.reply(`Окей, пришли мне файл автовыдачи в формате JSON.`, this.backKeyboard.reply());
    }

    async onUploadDeliveryFile(ctx) {
        let file = ctx.update.message.document;
        let file_id = file.file_id;
        let file_name = file.file_name;
        let contents = null;

        if(file_name != 'delivery.json') {
            ctx.reply(`❌ Неверный формат файла.`, this.mainKeyboard.reply());
            return;
        }

        try {
            ctx.reply(`♻️ Загружаю файл...`);
            
            log(`Попытка загрузки файла автовыдачи: ${file_name}, file_id: ${file_id}`, 'c');
            
            // Use Telegraf's built-in file downloading capability with the working approach
            try {
                // Get file info first
                const fileInfo = await this.bot.telegram.getFile(file_id);
                log(`Получена информация о файле автовыдачи: ${JSON.stringify(fileInfo)}`, 'g');
                
                // Use Telegraf's internal method to download the file
                const fileUrl = `https://api.telegram.org/file/bot${this.bot.token}/${fileInfo.file_path}`;
                
                // Use the working approach with Telegram-Bot-SDK User-Agent
                const fetchOptions = {
                    method: 'GET',
                    headers: {
                        'User-Agent': 'Telegram-Bot-SDK/1.0'
                    }
                };
                
                log(`Попытка загрузки файла автовыдачи по URL: ${fileUrl}`, 'c');
                
                const response = await fetch(fileUrl, fetchOptions);
                log(`Ответ от Telegram API для автовыдачи: ${response.status} ${response.statusText}`, 'c');
                
                if (!response.ok) {
                    throw new Error(`Telegram API вернул ошибку: ${response.status} ${response.statusText}`);
                }
                
                contents = await response.text();
                log(`Содержимое файла автовыдачи загружено, длина: ${contents.length}`, 'g');
            } catch (fetchError) {
                log(`Ошибка при загрузке файла автовыдачи из Telegram: ${fetchError}`, 'r');
                throw new Error(`Не удалось загрузить файл автовыдачи из Telegram: ${fetchError.message}`);
            }
        } catch(e) {
            log(`Ошибка при загрузке файла автовыдачи: ${e}`, 'r');
            ctx.reply(`❌ Не удалось загрузить файл: ${e.message}`, this.mainKeyboard.reply());
            return;
        }

        try {
            ctx.reply(`♻️ Проверяю валидность...`);

            let json = JSON.parse(contents);
            await updateFile(json, 'data/configs/delivery.json');
            ctx.reply(`✔️ Окей, обновил файл автовыдачи.`, this.editGoodsKeyboard.reply());
        } catch(e) {
            log(`Ошибка при разборе JSON файла автовыдачи: ${e}`, 'r');
            ctx.reply(`❌ Неверный формат JSON: ${e.message}`, this.mainKeyboard.reply());
        }
    }

    async onInlineQuery(ctx) {
        console.log(ctx);
    }

    getChatID() {
        try {
            // First try to get from storage constants
            let chatId = getConst('chatId');
            
            // If that fails, try to get from settings
            if (!chatId && global.settings) {
                chatId = global.settings.chatId;
            }
            
            // If that also fails, try to read from telegram.txt file
            if (!chatId) {
                const fs = global.fs_extra;
                const _dirname = process.cwd();
                const telegramFilePath = `${_dirname}/data/other/telegram.txt`;
                
                if (fs.existsSync(telegramFilePath)) {
                    const fileContent = fs.readFileSync(telegramFilePath, 'utf8').trim();
                    if (fileContent && !isNaN(fileContent)) {
                        chatId = fileContent;
                    }
                }
            }
            
            // Log for debugging
            log(`Получение Chat ID: ${chatId}`, 'c');
            
            // Validate that it's a valid number
            if (chatId && !isNaN(chatId)) {
                return chatId;
            }
            
            log(`Недействительный Chat ID: ${chatId}`, 'r');
            return false;
        } catch (error) {
            log(`Ошибка при получении Chat ID: ${error}`, 'r');
            return false;
        }
    }

    async sendNewMessageNotification(message) {
        let msg = `💬 <b>Новое сообщение</b> от пользователя <b><i>${message.user}</i></b>.\n\n`;
        msg += `${message.content}\n\n`;
        msg += `<i>${message.time}</i> | <a href="https://funpay.com/chat/?node=${message.node}">Перейти в чат</a>`

        let chatId = this.getChatID();
        if(!chatId) return;
        
        // Create unique reply command
        const replyCommand = `/reply_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        // Store conversation info for reply functionality
        this.activeChats.set(replyCommand, {
            userName: message.user,
            node: message.node,
            time: Date.now()
        });
        
        // Clean up old conversations (keep only last 50)
        if(this.activeChats.size > 50) {
            const oldEntries = Array.from(this.activeChats.keys()).slice(0, this.activeChats.size - 50);
            oldEntries.forEach(key => this.activeChats.delete(key));
        }
        
        // Create inline keyboard with reply and pause buttons
        const replyKeyboard = {
            inline_keyboard: [
                [{
                    text: `💬 Ответить ${message.user}`,
                    callback_data: replyCommand
                }],
                [
                    {
                        text: `⏸️ Пауза 5м`,
                        callback_data: `pause_${message.user}_5`
                    },
                    {
                        text: `⏸️ Пауза 10м`,
                        callback_data: `pause_${message.user}_10`
                    },
                    {
                        text: `⏸️ Пауза 30м`,
                        callback_data: `pause_${message.user}_30`
                    }
                ]
            ]
        };
        
        this.bot.telegram.sendMessage(chatId, msg, {
            parse_mode: 'HTML',
            disable_web_page_preview: true,
            reply_markup: replyKeyboard
        });
    }

    async sendNewOrderNotification(order) {
        let msg = `✔️ <b>Новый заказ</b> <a href="https://funpay.com/orders/${order.id.replace('#', '')}/">${order.id}</a> на сумму <b><i>${order.price} ${order.unit}</i></b>.\n\n`;
        msg += `👤 <b>Покупатель:</b> <a href="https://funpay.com/users/${order.buyerId}/">${order.buyerName}</a>\n`;
        msg += `🛍️ <b>Товар:</b> <code>${order.name}</code>`;

        let chatId = this.getChatID();
        log(`Попытка отправки уведомления о новом заказе ${order.id} в Telegram. Chat ID: ${chatId}`, 'c');
        
        if(!chatId) {
            log(`Не удалось получить Chat ID для отправки уведомления о заказе ${order.id}`, 'r');
            // Try to get chat ID from global settings as fallback
            if(global.settings && global.storage && global.storage.getConst) {
                chatId = global.storage.getConst('chatId');
                if(chatId) {
                    log(`Получен Chat ID из резервного источника: ${chatId}`, 'c');
                }
            }
            
            if(!chatId) {
                log(`Не удалось получить Chat ID ни из одного источника`, 'r');
                return;
            }
        }
        
        try {
            await this.bot.telegram.sendMessage(chatId, msg, {
                parse_mode: 'HTML',
                disable_web_page_preview: true
            });
            log(`Уведомление о новом заказе ${order.id} успешно отправлено в Telegram`, 'g');
            return true; // Return success status
        } catch (error) {
            log(`Ошибка при отправке уведомления о заказе ${order.id} в Telegram: ${error}`, 'r');
            // Try to send a simplified message as fallback
            try {
                const simpleMsg = `Новый заказ ${order.id} от ${order.buyerName} на ${order.price} ${order.unit}`;
                await this.bot.telegram.sendMessage(chatId, simpleMsg);
                log(`Резервное уведомление о заказе ${order.id} успешно отправлено в Telegram`, 'g');
                return true;
            } catch (fallbackError) {
                log(`Ошибка резервной отправки уведомления: ${fallbackError}`, 'r');
                return false;
            }
        }
    }

    async sendLotsRaiseNotification(category, nextTimeMsg) {
        let msg = `⬆️ Предложения в категории <a href="https://funpay.com/lots/${category.node_id}/trade">${category.name}</a> подняты.\n`;
        msg += `⌚ Следующее поднятие: <b><i>${nextTimeMsg}</i></b>`;

        let chatId = this.getChatID();
        if(!chatId) return;
        this.bot.telegram.sendMessage(chatId, msg, {
            parse_mode: 'HTML',
            disable_web_page_preview: true
        });
    }

    async sendDeliveryNotification(buyerName, productName, message) {
        let msg = `📦 Товар <code>${productName}</code> выдан покупателю <b><i>${buyerName}</i></b> с сообщением:\n\n`;
        msg += `${message}`;

        let chatId = this.getChatID();
        log(`Попытка отправки уведомления о выдаче товара в Telegram. Chat ID: ${chatId}`, 'c');
        
        if(!chatId) {
            log(`Не удалось получить Chat ID для отправки уведомления о выдаче товара`, 'r');
            // Try to get chat ID from global settings as fallback
            if(global.settings && global.storage && global.storage.getConst) {
                chatId = global.storage.getConst('chatId');
                if(chatId) {
                    log(`Получен Chat ID из резервного источника: ${chatId}`, 'c');
                }
            }
            
            if(!chatId) {
                log(`Не удалось получить Chat ID ни из одного источника`, 'r');
                return;
            }
        }
        
        try {
            await this.bot.telegram.sendMessage(chatId, msg, {
                parse_mode: 'HTML',
                disable_web_page_preview: true
            });
            log(`Уведомление о выдаче товара успешно отправлено в Telegram`, 'g');
        } catch (error) {
            log(`Ошибка при отправке уведомления о выдаче товара в Telegram: ${error}`, 'r');
            // Try to send a simplified message as fallback
            try {
                const simpleMsg = `Товар "${productName}" выдан покупателю ${buyerName}`;
                await this.bot.telegram.sendMessage(chatId, simpleMsg);
                log(`Резервное уведомление о выдаче товара успешно отправлено в Telegram`, 'g');
            } catch (fallbackError) {
                log(`Ошибка резервной отправки уведомления: ${fallbackError}`, 'r');
            }
        }
    }
    
    // Handle callback queries from inline buttons
    async onCallbackQuery(ctx) {
        try {
            const callbackData = ctx.callbackQuery.data;
            
            if(callbackData.startsWith('/reply_')) {
                await this.startReplyToUser(ctx, callbackData);
            }
            else if(callbackData.startsWith('pause_')) {
                await this.handleInlinePauseButton(ctx, callbackData);
            }
            
            // Answer callback query to remove loading state
            ctx.answerCbQuery();
        } catch (err) {
            log(`Ошибка при обработке callback query: ${err}`, 'r');
            ctx.answerCbQuery('Ошибка при обработке запроса');
        }
    }
    
    // Start reply process to a FunPay user
    async startReplyToUser(ctx, replyCommand) {
        try {
            const chatInfo = this.activeChats.get(replyCommand);
            
            if(!chatInfo) {
                ctx.reply('❌ Сообщение устарело или недоступно.');
                return;
            }
            
            // Check if conversation is not too old (24 hours)
            const age = Date.now() - chatInfo.time;
            if(age > 24 * 60 * 60 * 1000) {
                ctx.reply('❌ Сообщение слишком старое. Ответ недоступен.');
                this.activeChats.delete(replyCommand);
                return;
            }
            
            this.waitingForReply = true;
            this.currentReplyInfo = chatInfo;
            
            const cancelKeyboard = {
                keyboard: [[
                    { text: '❌ Отменить ответ' }
                ]],
                resize_keyboard: true,
                one_time_keyboard: true
            };
            
            ctx.reply(
                `💬 Отвечаю пользователю <b>${chatInfo.userName}</b>\n\nНапишите сообщение для отправки:`,
                {
                    parse_mode: 'HTML',
                    reply_markup: cancelKeyboard
                }
            );
            
            // Clean up the reply command from activeChats
            this.activeChats.delete(replyCommand);
        } catch (err) {
            log(`Ошибка при начале ответа: ${err}`, 'r');
            ctx.reply('❌ Ошибка при начале ответа.');
        }
    }
    
    // Handle reply message from user
    async handleReplyMessage(ctx) {
        try {
            const msg = ctx.update.message.text;
            
            if(msg === '❌ Отменить ответ') {
                this.waitingForReply = false;
                this.currentReplyInfo = null;
                ctx.reply('❌ Ответ отменён.', this.mainKeyboard.reply());
                return;
            }
            
            if(!this.currentReplyInfo) {
                ctx.reply('❌ Ошибка: информация о чате не найдена.', this.mainKeyboard.reply());
                this.waitingForReply = false;
                return;
            }
            
            // Send message to FunPay with manual watermark (different from auto-response watermark)
            const { sendMessage } = global.chat;
            const success = await sendMessage(this.currentReplyInfo.node, msg, false, 'manual');
            
            if(success) {
                ctx.reply(
                    `✅ Сообщение отправлено пользователю <b>${this.currentReplyInfo.userName}</b>!`,
                    {
                        parse_mode: 'HTML',
                        ...this.mainKeyboard.reply()
                    }
                );
                log(`Ответ через Telegram отправлен пользователю ${c.yellowBright(this.currentReplyInfo.userName)}: "${msg}"`, 'g');
            } else {
                ctx.reply(
                    `❌ Ошибка при отправке сообщения пользователю <b>${this.currentReplyInfo.userName}</b>.`,
                    {
                        parse_mode: 'HTML',
                        ...this.mainKeyboard.reply()
                    }
                );
                log(`Ошибка отправки ответа через Telegram пользователю ${c.yellowBright(this.currentReplyInfo.userName)}`, 'r');
            }
            
            this.waitingForReply = false;
            this.currentReplyInfo = null;
        } catch (err) {
            log(`Ошибка при обработке ответа: ${err}`, 'r');
            ctx.reply('❌ Ошибка при отправке ответа.', this.mainKeyboard.reply());
            this.waitingForReply = false;
            this.currentReplyInfo = null;
        }
    }
    
    // Handle /pause [username] [minutes] command
    async handlePauseCommand(ctx, msg) {
        try {
            const parts = msg.split(' ');
            if(parts.length < 2) {
                ctx.reply('📝 Формат: /pause [имя_пользователя] [минуты]\nПример: /pause Username123 15');
                return;
            }
            
            const targetUser = parts[1];
            const minutes = parts.length > 2 ? parseInt(parts[2]) || 10 : 10;
            
            const { pauseAutoResponseForUser } = global.chat;
            pauseAutoResponseForUser(targetUser, minutes);
            
            ctx.reply(
                `⏲️ Автоответы приостановлены для <b>${targetUser}</b> на <b>${minutes} мин.</b>\n\nИспользуйте /unpause ${targetUser} для возобновления.`,
                { parse_mode: 'HTML' }
            );
        } catch (err) {
            log(`Ошибка при обработке команды pause: ${err}`, 'r');
            ctx.reply('❌ Ошибка при выполнении команды.');
        }
    }
    
    // Handle /unpause [username] command
    async handleUnpauseCommand(ctx, msg) {
        try {
            const parts = msg.split(' ');
            if(parts.length < 2) {
                ctx.reply('📝 Формат: /unpause [имя_пользователя]\nПример: /unpause Username123');
                return;
            }
            
            const targetUser = parts[1];
            
            const { unpauseAutoResponseForUser } = global.chat;
            const wasUnpaused = unpauseAutoResponseForUser(targetUser);
            
            if(wasUnpaused) {
                ctx.reply(
                    `▶️ Автоответы возобновлены для <b>${targetUser}</b>.`,
                    { parse_mode: 'HTML' }
                );
            } else {
                ctx.reply(
                    `ℹ️ Пользователь <b>${targetUser}</b> не был на паузе.`,
                    { parse_mode: 'HTML' }
                );
            }
        } catch (err) {
            log(`Ошибка при обработке команды unpause: ${err}`, 'r');
            ctx.reply('❌ Ошибка при выполнении команды.');
        }
    }
    
    // Handle /pauselist command
    async handlePauseListCommand(ctx) {
        try {
            const { getPausedUsersInfo } = global.chat;
            const pausedUsersInfo = getPausedUsersInfo();
            
            if(pausedUsersInfo.length === 0) {
                ctx.reply('ℹ️ Нет пользователей на паузе.');
            } else {
                let pauseList = '⏸️ <b>Пользователи на паузе:</b>\n\n';
                for(const userInfo of pausedUsersInfo) {
                    pauseList += `• <code>${userInfo.userName}</code>: ${userInfo.remainingMinutes} мин.\n`;
                }
                pauseList += '\n📝 Используйте /unpause [имя] для возобновления';
                
                ctx.reply(pauseList, { parse_mode: 'HTML' });
            }
        } catch (err) {
            log(`Ошибка при обработке команды pauselist: ${err}`, 'r');
            ctx.reply('❌ Ошибка при получении списка пауз.');
        }
    }
    
    // === SETTINGS MANAGEMENT METHODS ===
    
    async editSettings(ctx) {
        const msg = `⚙️ <b>Редактирование настроек</b> ⚙️\n\nЗдесь вы можете управлять настройками бота.`;
        await ctx.replyWithHTML(msg, this.editSettingsKeyboard.reply());
    }
    
    async showSettings(ctx) {
        try {
            const settings = global.settings;
            let settingsText = `📋 <b>Текущие настройки</b> 📋\n\n`;
            
            settingsText += `<b>[FunPay настройки]</b>\n`;
            settingsText += `• alwaysOnline: <code>${settings.alwaysOnline}</code>\n`;
            settingsText += `• lotsRaise: <code>${settings.lotsRaise}</code>\n`;
            settingsText += `• goodsStateCheck: <code>${settings.goodsStateCheck}</code>\n`;
            settingsText += `• autoIssue: <code>${settings.autoIssue}</code>\n`;
            settingsText += `• autoResponse: <code>${settings.autoResponse}</code>\n`;
            settingsText += `• greetingMessage: <code>${settings.greetingMessage}</code>\n`;
            settingsText += `• greetingMessageText: <code>${settings.greetingMessageText}</code>\n`;
            settingsText += `• followUpMessage: <code>${settings.followUpMessage}</code>\n`;
            settingsText += `• followUpMessageText: <code>${settings.followUpMessageText}</code>\n`;
            settingsText += `• watermark: <code>${settings.watermark}</code>\n`;
            settingsText += `• telegramWatermark: <code>${settings.telegramWatermark}</code>\n\n`;
            
            settingsText += `<b>[Telegram настройки]</b>\n`;
            settingsText += `• telegramBot: <code>${settings.telegramBot}</code>\n`;
            settingsText += `• userName: <code>${settings.userName}</code>\n`;
            settingsText += `• newMessageNotification: <code>${settings.newMessageNotification}</code>\n`;
            settingsText += `• newOrderNotification: <code>${settings.newOrderNotification}</code>\n`;
            settingsText += `• lotsRaiseNotification: <code>${settings.lotsRaiseNotification}</code>\n`;
            settingsText += `• deliveryNotification: <code>${settings.deliveryNotification}</code>\n\n`;
            
            settingsText += `<b>[Proxy настройки]</b>\n`;
            settingsText += `• enabled: <code>${settings.proxy.useProxy}</code>\n`;
            settingsText += `• host: <code>${settings.proxy.host}</code>\n`;
            settingsText += `• port: <code>${settings.proxy.port}</code>`;
            
            ctx.replyWithHTML(settingsText, this.editSettingsKeyboard.reply());
        } catch (err) {
            log(`Ошибка при показе настроек: ${err}`, 'r');
            ctx.replyWithHTML(`❌ Ошибка при получении настроек.`, this.editSettingsKeyboard.reply());
        }
    }
    
    changeSettingValue(ctx) {
        ctx.replyWithHTML(
            `✏️ <b>Изменение настройки</b>\n\nВведите настройку в формате:\n<code>параметр: значение</code>\n\nПример:\n<code>параметр: значение</code>\n<code>greetingMessage: 1</code>\n<code>greetingMessageText: Привет! Как дела?</code>\n<code>watermark: [ 🔥MyBot ]</code>\n<code>followUpMessageText: Спасибо за покупку! Подтвердите заказ по ссылке https://funpay.com/orders/{order_id}/</code>`,
            this.backKeyboard.reply()
        );
        this.waitingForSettingValue = true;
    }
    
    async handleSettingValueChange(ctx) {
        try {
            const msg = ctx.update.message.text;
            this.waitingForSettingValue = false;
            
            // Parse the setting format: "parameter: value"
            const colonIndex = msg.indexOf(':');
            if (colonIndex === -1) {
                ctx.replyWithHTML(`❌ Неверный формат. Используйте: <code>параметр: значение</code>`, this.editSettingsKeyboard.reply());
                return;
            }
            
            const parameter = msg.substring(0, colonIndex).trim();
            const value = msg.substring(colonIndex + 1).trim();
            
            if (!parameter || !value) {
                ctx.replyWithHTML(`❌ Параметр или значение не может быть пустым.`, this.editSettingsKeyboard.reply());
                return;
            }
            
            // Update the setting
            const success = await this.updateSetting(parameter, value);
            
            if (success) {
                ctx.replyWithHTML(
                    `✅ Настройка обновлена!\n\n<b>${parameter}</b>: <code>${value}</code>\n\n⚠️ <b>Внимание:</b> Для применения некоторых изменений может потребоваться перезапуск бота.`,
                    this.editSettingsKeyboard.reply()
                );
            } else {
                ctx.replyWithHTML(`❌ Ошибка при обновлении настройки. Проверьте правильность параметра.`, this.editSettingsKeyboard.reply());
            }
        } catch (err) {
            log(`Ошибка при изменении настройки: ${err}`, 'r');
            ctx.replyWithHTML(`❌ Ошибка при изменении настройки.`, this.editSettingsKeyboard.reply());
            this.waitingForSettingValue = false;
        }
    }
    
    async updateSetting(parameter, value) {
        try {
            const { saveConfig } = global.storage;
            const settings = global.settings;
            
            // List of valid parameters that can be changed
            const validParameters = [
                'alwaysOnline', 'lotsRaise', 'goodsStateCheck', 'autoIssue', 'autoResponse',
                'greetingMessage', 'greetingMessageText', 'watermark', 'telegramWatermark',
                'newMessageNotification', 'newOrderNotification', 'lotsRaiseNotification', 'deliveryNotification',
                'followUpMessage', 'followUpMessageText'
            ];
            
            if (!validParameters.includes(parameter)) {
                log(`Попытка изменить недопустимый параметр: ${parameter}`, 'r');
                return false;
            }
            
            // Convert numeric values
            let processedValue = value;
            if (['alwaysOnline', 'lotsRaise', 'goodsStateCheck', 'autoIssue', 'autoResponse', 
                'greetingMessage', 'newMessageNotification', 'newOrderNotification', 
                'lotsRaiseNotification', 'deliveryNotification', 'followUpMessage'].includes(parameter)) {
                processedValue = parseInt(value);
                if (isNaN(processedValue) || (processedValue !== 0 && processedValue !== 1)) {
                    log(`Неверное числовое значение для ${parameter}: ${value}`, 'r');
                    return false;
                }
            }
            
            // Update the setting
            settings[parameter] = processedValue;
            
            // Save to file
            await saveConfig(settings);
            
            log(`Настройка обновлена: ${parameter} = ${processedValue}`, 'g');
            return true;
        } catch (err) {
            log(`Ошибка при обновлении настройки: ${err}`, 'r');
            return false;
        }
    }
    
    async getSettingsFile(ctx) {
        try {
            ctx.replyWithDocument({
                source: './settings.txt',
                filename: 'settings.txt'
            }).catch(function(error) { 
                log(`Ошибка при отправке файла настроек: ${error}`, 'r');
                ctx.replyWithHTML(`❌ Ошибка при отправке файла настроек.`, this.editSettingsKeyboard.reply());
            });
        } catch (err) {
            log(`Ошибка при получении файла настроек: ${err}`, 'r');
            ctx.replyWithHTML(`❌ Ошибка при получении файла настроек.`, this.editSettingsKeyboard.reply());
        }
    }
    
    // Add feedback management methods
    async manageFeedback(ctx) {
        ctx.reply('📊 Управление обратной связью', this.feedbackKeyboard.reply());
    }

    async handleFeedbackAction(ctx, msg) {
        try {
            if (!global.googleSheetsFAQ) {
                ctx.reply('❌ Модуль Google Sheets FAQ не инициализирован.', this.feedbackKeyboard.reply());
                this.waitingForFeedbackAction = false;
                return;
            }

            // Handle cancel action
            if (msg.trim().toLowerCase() === 'отмена' || msg.trim().toLowerCase() === '❌ отменить') {
                ctx.reply('❌ Действие отменено.', this.feedbackKeyboard.reply());
                this.waitingForFeedbackAction = false;
                this.pendingFeedbackAction = null;
                return;
            }

            // Handle approve action (when user provides a custom answer)
            if (this.pendingFeedbackAction && this.pendingFeedbackAction.type === 'approve') {
                const questionId = this.pendingFeedbackAction.questionId;
                const newAnswer = msg.trim();

                // Update status to approved with the new answer
                await global.googleSheetsFAQ.updatePendingResponseStatus(questionId, 'approved', newAnswer);
                ctx.reply(`✅ Ответ с ID ${questionId} одобрен с новым текстом.`, this.feedbackKeyboard.reply());
                log(`Ответ с ID ${questionId} одобрен. Новый ответ: ${newAnswer}`, 'g');
                
                this.waitingForFeedbackAction = false;
                this.pendingFeedbackAction = null;
                return;
            }

            // Handle reject action (when user provides a custom answer)
            if (this.pendingFeedbackAction && this.pendingFeedbackAction.type === 'reject') {
                const questionId = this.pendingFeedbackAction.questionId;
                const newAnswer = msg.trim();

                // Update status to rejected with new answer
                await global.googleSheetsFAQ.updatePendingResponseStatus(questionId, 'rejected', newAnswer);
                ctx.reply(`✅ Ответ с ID ${questionId} отклонен. Новый ответ сохранен.`, this.feedbackKeyboard.reply());
                log(`Ответ с ID ${questionId} отклонен. Новый ответ: ${newAnswer}`, 'g');
                
                this.waitingForFeedbackAction = false;
                this.pendingFeedbackAction = null;
                return;
            }
            
            // Handle edit action (when user provides a custom answer to replace the AI answer)
            if (this.pendingFeedbackAction && this.pendingFeedbackAction.type === 'edit') {
                const questionId = this.pendingFeedbackAction.questionId;
                const newAnswer = msg.trim();

                // Update status to approved with the new answer (editing means providing a better answer)
                await global.googleSheetsFAQ.updatePendingResponseStatus(questionId, 'approved', newAnswer);
                ctx.reply(`✅ Ответ с ID ${questionId} отредактирован и одобрен.`, this.feedbackKeyboard.reply());
                log(`Ответ с ID ${questionId} отредактирован. Новый ответ: ${newAnswer}`, 'g');
                
                this.waitingForFeedbackAction = false;
                this.pendingFeedbackAction = null;
                return;
            }

            ctx.reply('❌ Непредвиденная ошибка. Попробуйте снова.', this.feedbackKeyboard.reply());
            this.waitingForFeedbackAction = false;
            this.pendingFeedbackAction = null;
        } catch (err) {
            log(`Ошибка при обработке действия обратной связи: ${err}`, 'r');
            ctx.reply(`❌ Ошибка: ${err.message}`, this.feedbackKeyboard.reply());
            this.waitingForFeedbackAction = false;
            this.pendingFeedbackAction = null;
        }
    }

    async viewPendingResponses(ctx) {
        try {
            // Try to initialize Google Sheets FAQ if not already done and enabled in settings
            if (!global.googleSheetsFAQ && global.settings && global.settings.googleSheetsFAQEnabled) {
                log(`Google Sheets FAQ не инициализирован, попытка инициализации`, 'c');
                await this.initializeGoogleSheetsFAQ();
            }
            
            if (!global.googleSheetsFAQ) {
                ctx.reply('❌ Модуль Google Sheets FAQ не инициализирован. Проверьте настройки и логи.', this.feedbackKeyboard.reply());
                return;
            }

            const pendingResponses = global.googleSheetsFAQ.getPendingResponses();
            if(pendingResponses.length === 0) {
                ctx.reply('📭 Нет ожидающих ответов для проверки.', this.feedbackKeyboard.reply());
            } else {
                // Send each pending response with inline buttons
                for(let i = 0; i < pendingResponses.length; i++) {
                    const pending = pendingResponses[i];
                    let message = `📬 Ожидающий ответ для проверки:\n\n`;
                    message += `🆔 ID: <code>${pending.id}</code>\n`;
                    message += `❓ Вопрос: <b>${pending.question}</b>\n`;
                    message += `🤖 Ответ ИИ: <i>${pending.aiAnswer}</i>\n\n`;
                    
                    // Create inline keyboard with approve/reject/edit buttons
                    const inlineKeyboard = {
                        inline_keyboard: [
                            [
                                {
                                    text: '✅ Одобрить',
                                    callback_data: `approve_${pending.id}`
                                },
                                {
                                    text: '✏️ Редактировать',
                                    callback_data: `edit_${pending.id}`
                                },
                                {
                                    text: '❌ Отклонить',
                                    callback_data: `reject_${pending.id}`
                                }
                            ]
                        ]
                    };
                    
                    await ctx.replyWithHTML(message, {
                        reply_markup: inlineKeyboard
                    });
                }
                
                // Add a summary message
                const summaryMessage = `Всего ожидающих ответов: ${pendingResponses.length}\n\nВыберите действие для каждого ответа с помощью кнопок ниже.`;
                ctx.reply(summaryMessage, this.feedbackKeyboard.reply());
            }
        } catch (err) {
            log(`Ошибка при получении ожидающих ответов: ${err}`, 'r');
            ctx.reply(`❌ Ошибка: ${err.message}`, this.feedbackKeyboard.reply());
        }
    }

    // These methods are no longer needed with the new inline button system
    // async approveResponse(ctx) { ... }
    // async rejectResponse(ctx) { ... }

    // Helper method to initialize Google Sheets FAQ module
    async initializeGoogleSheetsFAQ() {
        try {
            log(`Попытка инициализации Google Sheets FAQ из Telegram бота`, 'c');
            
            // Validate required settings
            if (!global.settings || !global.settings.googleSheetsId || !global.settings.googleSheetsServiceAccountPath) {
                log(`Ошибка: Не заданы обязательные параметры Google Sheets (ID или путь к файлу сервисного аккаунта)`, 'r');
                return false;
            }
            
            if (!global.googlesheets || !global.googlesheets.default) {
                log(`Ошибка: Модуль googlesheets не доступен`, 'r');
                return false;
            }
            
            const GoogleSheetsFAQ = global.googlesheets.default;
            global.googleSheetsFAQ = new GoogleSheetsFAQ(
                global.settings.googleSheetsId,
                global.settings.googleSheetsServiceAccountPath,
                global.settings.googleSheetsRange || 'FAQ!A:B',
                global.settings.googleSheetsGeminiApiKey || null,
                global.settings.googleSheetsFeedbackSheetName || 'Feedback',
                global.settings.googleSheetsContextSheetName || 'Context'
            );
            
            log(`Экземпляр GoogleSheetsFAQ создан из Telegram бота, загрузка данных FAQ`, 'c');
            
            // Load FAQ data
            const faqLoaded = await global.googleSheetsFAQ.refreshFAQData();
            if (!faqLoaded) {
                log(`Не удалось загрузить данные из Google Sheets FAQ.`, 'r');
                return false;
            } else {
                log(`Google Sheets FAQ успешно инициализирован из Telegram бота. Загружено ${global.googleSheetsFAQ.getFAQData().length} записей.`, 'g');
                return true;
            }
        } catch (err) {
            log(`Ошибка при инициализации Google Sheets FAQ из Telegram бота: ${err}`, 'r');
            return false;
        }
    }

    // Handle callback queries from inline buttons for pending responses
    async onCallbackQuery(ctx) {
        try {
            const callbackData = ctx.callbackQuery.data;
            
            if(callbackData.startsWith('/reply_')) {
                await this.startReplyToUser(ctx, callbackData);
            }
            else if(callbackData.startsWith('pause_')) {
                await this.handleInlinePauseButton(ctx, callbackData);
            }
            // Handle approve/reject/edit callbacks for pending responses
            else if(callbackData.startsWith('approve_')) {
                await this.handleApproveResponse(ctx, callbackData);
            }
            else if(callbackData.startsWith('reject_')) {
                await this.handleRejectResponse(ctx, callbackData);
            }
            else if(callbackData.startsWith('edit_')) {
                await this.handleEditResponse(ctx, callbackData);
            }
            else if(callbackData === 'noop') {
                // Do nothing, just acknowledge the callback
                ctx.answerCbQuery();
            }
            
            // Answer callback query to remove loading state
            ctx.answerCbQuery();
        } catch (err) {
            log(`Ошибка при обработке callback query: ${err}`, 'r');
            ctx.answerCbQuery('Ошибка при обработке запроса');
        }
    }
    
    // Handle approve response callback
    async handleApproveResponse(ctx, callbackData) {
        try {
            const questionId = callbackData.substring(8); // Remove 'approve_' prefix
            
            if (!global.googleSheetsFAQ) {
                ctx.answerCbQuery('❌ Модуль Google Sheets FAQ не инициализирован');
                return;
            }
            
            // Get the pending response to retrieve the AI answer
            const pendingResponses = global.googleSheetsFAQ.getPendingResponses();
            const pendingResponse = pendingResponses.find(p => p.id === questionId);
            
            if (!pendingResponse) {
                ctx.answerCbQuery('❌ Ответ не найден');
                return;
            }
            
            // Approve with the AI answer by default
            const aiAnswer = pendingResponse.aiAnswer;
            await global.googleSheetsFAQ.updatePendingResponseStatus(questionId, 'approved', aiAnswer);
            
            ctx.answerCbQuery(`✅ Ответ с ID ${questionId} одобрен с ответом ИИ`);
            
            // Update the message to show it was approved
            const message = `📬 Ожидающий ответ для проверки:\n\n` +
                           `🆔 ID: <code>${questionId}</code>\n` +
                           `❓ Вопрос: <b>${pendingResponse.question}</b>\n` +
                           `🤖 Ответ ИИ: <i>${aiAnswer}</i>\n\n` +
                           `✅ <b>Одобрен</b>`;
                           
            await ctx.editMessageText(message, {
                parse_mode: 'HTML',
                reply_markup: {
                    inline_keyboard: [
                        [
                            { text: '✅ Одобрено', callback_data: 'noop' }
                        ]
                    ]
                }
            });
        } catch (err) {
            log(`Ошибка при обработке одобрения ответа: ${err}`, 'r');
            ctx.answerCbQuery('❌ Ошибка при обработке одобрения');
        }
    }
    
    // Handle reject response callback
    async handleRejectResponse(ctx, callbackData) {
        try {
            const questionId = callbackData.substring(7); // Remove 'reject_' prefix
            
            if (!global.googleSheetsFAQ) {
                ctx.answerCbQuery('❌ Модуль Google Sheets FAQ не инициализирован');
                return;
            }
            
            // Get the pending response for displaying in the message
            const pendingResponses = global.googleSheetsFAQ.getPendingResponses();
            const pendingResponse = pendingResponses.find(p => p.id === questionId);
            
            if (!pendingResponse) {
                ctx.answerCbQuery('❌ Ответ не найден');
                return;
            }
            
            // Reject without requiring a new answer
            await global.googleSheetsFAQ.updatePendingResponseStatus(questionId, 'rejected');
            
            ctx.answerCbQuery(`✅ Ответ с ID ${questionId} отклонен`);
            
            // Update the message to show it was rejected
            const message = `📬 Ожидающий ответ для проверки:\n\n` +
                           `🆔 ID: <code>${questionId}</code>\n` +
                           `❓ Вопрос: <b>${pendingResponse.question}</b>\n` +
                           `🤖 Ответ ИИ: <i>${pendingResponse.aiAnswer}</i>\n\n` +
                           `❌ <b>Отклонен</b>`;
                           
            await ctx.editMessageText(message, {
                parse_mode: 'HTML',
                reply_markup: {
                    inline_keyboard: [
                        [
                            { text: '❌ Отклонено', callback_data: 'noop' }
                        ]
                    ]
                }
            });
        } catch (err) {
            log(`Ошибка при обработке отклонения ответа: ${err}`, 'r');
            ctx.answerCbQuery('❌ Ошибка при обработке отклонения');
        }
    }
    
    // Handle edit response callback
    async handleEditResponse(ctx, callbackData) {
        try {
            const questionId = callbackData.substring(5); // Remove 'edit_' prefix
            
            if (!global.googleSheetsFAQ) {
                ctx.answerCbQuery('❌ Модуль Google Sheets FAQ не инициализирован');
                return;
            }
            
            // Ask for the correct answer
            let message = `✏️ Введите правильный ответ для вопроса с ID: <code>${questionId}</code>\n\n`;
            message += 'Или отправьте "отмена" для отмены.';
            
            this.pendingFeedbackAction = {
                type: 'edit',
                questionId: questionId
            };
            this.waitingForFeedbackAction = true;
            
            // Answer the callback query first
            ctx.answerCbQuery('Введите правильный ответ');
            
            // Send message with cancel keyboard
            const cancelKeyboard = {
                keyboard: [[
                    { text: '❌ Отменить' }
                ]],
                resize_keyboard: true,
                one_time_keyboard: true
            };
            
            await ctx.replyWithHTML(message, {
                reply_markup: cancelKeyboard
            });
        } catch (err) {
            log(`Ошибка при обработке редактирования ответа: ${err}`, 'r');
            ctx.answerCbQuery('❌ Ошибка при обработке редактирования');
        }
    }
    
    uploadSettingsFile(ctx) {
        this.waitingForSettingsFile = true;
        ctx.reply(`Окей, пришли мне файл настроек settings.txt.`, this.backKeyboard.reply());
    }
    
    async onUploadSettingsFile(ctx) {
        let file = ctx.update.message.document;
        let file_id = file.file_id;
        let file_name = file.file_name;
        let contents = null;

        this.waitingForSettingsFile = false;

        if(file_name != 'settings.txt') {
            ctx.reply(`❌ Неверный формат файла. Ожидается settings.txt`, this.editSettingsKeyboard.reply());
            return;
        }

        try {
            ctx.reply(`♻️ Загружаю файл...`);
            
            log(`Попытка загрузки файла настроек: ${file_name}, file_id: ${file_id}`, 'c');
            
            // Use Telegraf's built-in file downloading capability with the working approach
            try {
                // Get file info first
                const fileInfo = await this.bot.telegram.getFile(file_id);
                log(`Получена информация о файле настроек: ${JSON.stringify(fileInfo)}`, 'g');
                
                // Use Telegraf's internal method to download the file
                const fileUrl = `https://api.telegram.org/file/bot${this.bot.token}/${fileInfo.file_path}`;
                
                // Use the working approach with Telegram-Bot-SDK User-Agent
                const fetchOptions = {
                    method: 'GET',
                    headers: {
                        'User-Agent': 'Telegram-Bot-SDK/1.0'
                    }
                };
                
                log(`Попытка загрузки файла настроек по URL: ${fileUrl}`, 'c');
                
                const response = await fetch(fileUrl, fetchOptions);
                log(`Ответ от Telegram API для настроек: ${response.status} ${response.statusText}`, 'c');
                
                if (!response.ok) {
                    throw new Error(`Telegram API вернул ошибку: ${response.status} ${response.statusText}`);
                }
                
                contents = await response.text();
                log(`Содержимое файла настроек загружено, длина: ${contents.length}`, 'g');
            } catch (fetchError) {
                log(`Ошибка при загрузке файла настроек из Telegram: ${fetchError}`, 'r');
                throw new Error(`Не удалось загрузить файл настроек из Telegram: ${fetchError.message}`);
            }

            ctx.reply(`♻️ Проверяю валидность...`);

            // Write the new settings file
            const fs = global.fs_extra;
            await fs.writeFile('./settings.txt', contents);
            
            ctx.reply(`✅ Файл настроек обновлен.\n\n⚠️ Внимание: Перезапустите бота для применения изменений.`, {
                parse_mode: 'HTML',
                ...this.editSettingsKeyboard.reply()
            });
            log(`Файл настроек обновлен через Telegram`, 'g');
        } catch(e) {
            log(`Ошибка при обновлении файла настроек: ${e}`, 'r');
            ctx.reply(`❌ Ошибка при сохранении файла настроек: ${e.message}`, this.editSettingsKeyboard.reply());
        }
    }
    
    async editAutoResponse(ctx) {
        const msg = `🤖 <b>Редактирование автоответов</b> 🤖\n\nЗдесь вы можете управлять автоматическими ответами бота.`;
        await ctx.replyWithHTML(msg, this.editAutoResponseKeyboard.reply());
    }
    
    addAutoResponse(ctx) {
        ctx.replyWithHTML(
            `➕ <b>Добавление автоответа</b>\n\nОтправьте один или несколько шаблонов (каждый с новой строки).\nПример:\nпривет\nздравствуйте\nдобрый день`,
            this.backKeyboard.reply()
        );
        this.waitingForAutoResponsePatterns = true;
    }
    
    async saveAutoResponsePatterns(ctx) {
        const msg = ctx.update.message.text;
        this.currentAutoResponse.patterns = msg.split('\n').map(p => p.trim()).filter(p => p.length > 0);
        this.waitingForAutoResponsePatterns = false;
        
        ctx.replyWithHTML(
            `✓ Паттерны сохранены: <code>${this.currentAutoResponse.patterns.join(', ')}</code>\n\nТеперь отправьте один или несколько ответов (каждый с новой строки).`,
            this.backKeyboard.reply()
        );
        this.waitingForAutoResponseResponses = true;
    }
    
    async saveAutoResponseResponses(ctx) {
        const msg = ctx.update.message.text;
        this.currentAutoResponse.responses = msg.split('\n').map(r => r.trim()).filter(r => r.length > 0);
        this.waitingForAutoResponseResponses = false;
        
        try {
            const autoResponses = await load('data/configs/autoResponse.json');
            autoResponses.push({
                patterns: this.currentAutoResponse.patterns,
                responses: this.currentAutoResponse.responses
            });
            await updateFile(autoResponses, 'data/configs/autoResponse.json');
            
            this.currentAutoResponse = { patterns: [], responses: [] };
            ctx.replyWithHTML(`✅ Автоответ успешно добавлен!`, this.editAutoResponseKeyboard.reply());
        } catch (err) {
            log(`Ошибка при сохранении автоответа: ${err}`, 'r');
            ctx.replyWithHTML(`❌ Ошибка при сохранении автоответа.`, this.editAutoResponseKeyboard.reply());
        }
    }
    
    async viewAllAutoResponses(ctx) {
        try {
            const autoResponses = await load('data/configs/autoResponse.json');
            
            if(!autoResponses || autoResponses.length === 0) {
                ctx.replyWithHTML(`📄 <b>Список автоответов</b>\n\nАвтоответы отсутствуют.`, this.editAutoResponseKeyboard.reply());
                return;
            }
            
            let msg = `📄 <b>Список автоответов</b> (всего: ${autoResponses.length})\n\n`;
            
            for(let i = 0; i < Math.min(autoResponses.length, 10); i++) {
                const ar = autoResponses[i];
                const patterns = ar.patterns ? ar.patterns.slice(0, 3).join(', ') : 'нет паттернов';
                const responses = ar.responses ? `${ar.responses.length} ответов` : 'нет ответов';
                
                msg += `<b>[${i + 1}]</b> Паттерны: <code>${patterns}</code>\n     Ответы: ${responses}\n\n`;
            }
                
            if(autoResponses.length > 10) {
                msg += `... и ещё ${autoResponses.length - 10} автоответов.\n\n`;
            }
            
            ctx.replyWithHTML(msg, this.editAutoResponseKeyboard.reply());
        } catch (err) {
            log(`Ошибка при получении списка автоответов: ${err}`, 'r');
            ctx.replyWithHTML(`❌ Ошибка при получении списка.`, this.editAutoResponseKeyboard.reply());
        }
    }
    
    removeAutoResponse(ctx) {
        ctx.replyWithHTML(`❌ <b>Удаление автоответа</b>\n\nВведите номер автоответа.`, this.backKeyboard.reply());
        this.waitingForAutoResponseDelete = true;
    }
    
    async deleteAutoResponse(ctx) {
        const msg = ctx.update.message.text;
        this.waitingForAutoResponseDelete = false;
        
        const num = Number(msg);
        if(isNaN(num)) {
            ctx.replyWithHTML(`❌ Неверный формат.`, this.editAutoResponseKeyboard.reply());
            return;
        }
        
        try {
            const autoResponses = await load('data/configs/autoResponse.json');
            if(num < 1 || num > autoResponses.length) {
                ctx.replyWithHTML(`❌ Автоответ не найден.`, this.editAutoResponseKeyboard.reply());
                return;
            }
            
            autoResponses.splice(num - 1, 1);
            await updateFile(autoResponses, 'data/configs/autoResponse.json');
            ctx.replyWithHTML(`✅ Автоответ удалён!`, this.editAutoResponseKeyboard.reply());
        } catch (err) {
            log(`Ошибка при удалении: ${err}`, 'r');
            ctx.replyWithHTML(`❌ Ошибка при удалении.`, this.editAutoResponseKeyboard.reply());
        }
    }
    
    async getAutoResponseFile(ctx) {
        try {
            ctx.replyWithDocument({
                source: 'data/configs/autoResponse.json',
                filename: 'autoResponse.json'
            }).catch(() => {
                ctx.replyWithHTML(`❌ Ошибка отправки файла.`, this.editAutoResponseKeyboard.reply());
            });
        } catch (err) {
            ctx.replyWithHTML(`❌ Ошибка получения файла.`, this.editAutoResponseKeyboard.reply());
        }
    }
    
    uploadAutoResponseFile(ctx) {
        this.waitingForAutoResponseFile = true;
        ctx.replyWithHTML(`⬆️ Отправьте файл JSON.`, this.backKeyboard.reply());
    }
    
    async onUploadAutoResponseFile(ctx) {
        let file = ctx.update.message.document;
        this.waitingForAutoResponseFile = false;
        
        if(!file || !file.file_name.endsWith('.json')) {
            ctx.replyWithHTML(`❌ Неверный формат файла.`, this.editAutoResponseKeyboard.reply());
            return;
        }
        
        try {
            ctx.replyWithHTML('♻️ Обрабатываю...');
            
            log(`Попытка загрузки файла: ${file.file_name}, file_id: ${file.file_id}`, 'c');
            
            // Use Telegraf's built-in file downloading capability with the working approach
            let contents;
            try {
                // Get file info first
                const fileInfo = await this.bot.telegram.getFile(file.file_id);
                log(`Получена информация о файле: ${JSON.stringify(fileInfo)}`, 'g');
                
                // Use Telegraf's internal method to download the file
                const fileUrl = `https://api.telegram.org/file/bot${this.bot.token}/${fileInfo.file_path}`;
                
                // Use the working approach with Telegram-Bot-SDK User-Agent
                const fetchOptions = {
                    method: 'GET',
                    headers: {
                        'User-Agent': 'Telegram-Bot-SDK/1.0'
                    }
                };
                
                log(`Попытка загрузки файла по URL: ${fileUrl}`, 'c');
                
                const response = await fetch(fileUrl, fetchOptions);
                log(`Ответ от Telegram API: ${response.status} ${response.statusText}`, 'c');
                
                if (!response.ok) {
                    throw new Error(`Telegram API вернул ошибку: ${response.status} ${response.statusText}`);
                }
                
                contents = await response.text();
                log(`Содержимое файла загружено, длина: ${contents.length}`, 'g');
                log(`Первые 200 символов содержимого: ${contents.substring(0, 200)}`, 'c');
            } catch (fetchError) {
                log(`Ошибка при загрузке файла из Telegram: ${fetchError}`, 'r');
                throw new Error(`Не удалось загрузить файл из Telegram: ${fetchError.message}`);
            }
            
            // Parse JSON
            let json;
            try {
                json = JSON.parse(contents);
                log(`JSON разобран, тип: ${typeof json}`, 'g');
            } catch (parseError) {
                log(`Ошибка при разборе JSON: ${parseError}`, 'r');
                log(`Содержимое файла: ${contents}`, 'r');
                throw new Error(`Файл содержит недопустимый JSON: ${parseError.message}`);
            }
            
            // Check if it's an array
            if(!Array.isArray(json)) {
                log(`Загруженный файл не является массивом. Тип: ${typeof json}, Значение: ${JSON.stringify(json).substring(0, 200)}`, 'r');
                throw new Error('Файл должен содержать массив');
            }
            
            await updateFile(json, 'data/configs/autoResponse.json');
            
            // Reload autoRespData in chat module
            try {
                const { reloadAutoResponseData } = global.chat;
                if (reloadAutoResponseData && typeof reloadAutoResponseData === 'function') {
                    await reloadAutoResponseData();
                }
            } catch (reloadErr) {
                log(`Ошибка перезагрузки данных автоответов: ${reloadErr}`, 'r');
            }
            
            ctx.replyWithHTML(`✅ Файл обновлён! Загружено: ${json.length} автоответов`, this.editAutoResponseKeyboard.reply());
        } catch (err) {
            log(`Ошибка обработки файла: ${err}`, 'r');
            ctx.replyWithHTML(`❌ Ошибка обработки: ${err.message}`, this.editAutoResponseKeyboard.reply());
        }
    }

    
    // Handle inline pause button click
    async handleInlinePauseButton(ctx, callbackData) {
        try {
            // Parse callback data: "pause_{username}_{minutes}"
            const parts = callbackData.split('_');
            if(parts.length < 3) {
                ctx.answerCbQuery('❌ Ошибка формата команды');
                return;
            }
            
            const targetUser = parts[1];
            const minutes = parseInt(parts[2]) || 10;
            
            const { pauseAutoResponseForUser, isUserPaused, getRemainingPauseTime } = global.chat;
            
            // Check if user is already paused
            if(isUserPaused(targetUser)) {
                const remainingMinutes = getRemainingPauseTime(targetUser);
                ctx.answerCbQuery(`ℹ️ Пользователь ${targetUser} уже на паузе (осталось ${remainingMinutes} мин.)`);
                return;
            }
            
            // Pause the user
            pauseAutoResponseForUser(targetUser, minutes);
            
            // Send confirmation message
            ctx.answerCbQuery(`⏲️ Пауза активирована для ${targetUser} на ${minutes} мин.`);
            
            // Also send a message to show the action was successful
            const confirmationMsg = `⏸️ <b>Пауза активирована</b>\n\n` +
                `Пользователь: <code>${targetUser}</code>\n` +
                `Продолжительность: <b>${minutes} минут</b>\n\n` +
                `Автоответы будут приостановлены на указанное время.\n\n` +
                `📝 Используйте /unpause ${targetUser} для раннего возобновления.`;
            
            const chatId = this.getChatID();
            if(chatId) {
                this.bot.telegram.sendMessage(chatId, confirmationMsg, {
                    parse_mode: 'HTML'
                });
            }
            
        } catch (err) {
            log(`Ошибка при обработке кнопки паузы: ${err}`, 'r');
            ctx.answerCbQuery('❌ Ошибка при активации паузы');
        }
    }
}

export default TelegramBot;