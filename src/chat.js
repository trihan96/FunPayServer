// MODULES
const fetch = global.fetch;
const c = global.chalk;
const log = global.log;
const parseDOM = global.DOMParser;
const { load, getConst, updateFile } = global.storage;
const { getRandomTag } = global.activity;

// CONSTANTS
const settings = global.settings;
let autoRespData = await load('data/configs/autoResponse.json');

// Add error handling for autoRespData
if (!autoRespData || !Array.isArray(autoRespData)) {
    log(`Ошибка загрузки файла autoResponse.json. Файл будет создан с пустым массивом.`, 'r');
    // Initialize with empty array if file doesn't exist or is invalid
    await updateFile([], 'data/configs/autoResponse.json');
    autoRespData = [];
}

// Add error handling for autoRespData
if (!autoRespData) {
    log(`Ошибка загрузки файла autoResponse.json. Файл будет создан с пустым массивом.`, 'r');
    // Initialize with empty array if file doesn't exist or is invalid
    await updateFile([], 'data/configs/autoResponse.json');
}

// Track sent messages to prevent self-response
const sentMessages = new Set();
// Track paused users (username -> expiry timestamp)
const pausedUsers = new Map();
let isAutoRespBusy = false;

function enableAutoResponse() {
    log(`Автоответ запущен.`, 'g');
}

// Pause auto-responses for a specific user
function pauseAutoResponseForUser(userName, durationMinutes = 10) {
    const expiryTime = Date.now() + (durationMinutes * 60 * 1000);
    pausedUsers.set(userName, expiryTime);
    log(`Автоответы приостановлены для пользователя ${c.yellowBright(userName)} на ${durationMinutes} минут.`, 'c');
    return true;
}

// Unpause auto-responses for a specific user
function unpauseAutoResponseForUser(userName) {
    const wasPaused = pausedUsers.has(userName);
    pausedUsers.delete(userName);
    if(wasPaused) {
        log(`Автоответы возобновлены для пользователя ${c.yellowBright(userName)}.`, 'g');
        return true;
    }
    return false;
}

// Check if user is currently paused
function isUserPaused(userName) {
    if(!pausedUsers.has(userName)) {
        return false;
    }
    
    const expiryTime = pausedUsers.get(userName);
    if(Date.now() > expiryTime) {
        // Pause expired, remove it
        pausedUsers.delete(userName);
        log(`Пауза автоответов для пользователя ${c.yellowBright(userName)} автоматически завершена.`, 'g');
        return false;
    }
    
    return true;
}

// Get remaining pause time for user in minutes
function getRemainingPauseTime(userName) {
    if(!pausedUsers.has(userName)) {
        return 0;
    }
    
    const expiryTime = pausedUsers.get(userName);
    const remaining = Math.max(0, expiryTime - Date.now());
    return Math.ceil(remaining / (60 * 1000)); // Convert to minutes
}

// Get list of paused users with remaining time
function getPausedUsersInfo() {
    const result = [];
    for(const [userName, expiryTime] of pausedUsers.entries()) {
        const remaining = Math.max(0, expiryTime - Date.now());
        const minutes = Math.ceil(remaining / (60 * 1000));
        result.push({
            userName: userName,
            remainingMinutes: minutes
        });
    }
    return result;
}

// Fuzzy matching function using Levenshtein distance
function calculateSimilarity(str1, str2) {
    const len1 = str1.length;
    const len2 = str2.length;
    
    // Create matrix
    const matrix = Array(len1 + 1).fill().map(() => Array(len2 + 1).fill(0));
    
    // Initialize first row and column
    for (let i = 0; i <= len1; i++) matrix[i][0] = i;
    for (let j = 0; j <= len2; j++) matrix[0][j] = j;
    
    // Fill matrix
    for (let i = 1; i <= len1; i++) {
        for (let j = 1; j <= len2; j++) {
            const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
            matrix[i][j] = Math.min(
                matrix[i - 1][j] + 1,     // deletion
                matrix[i][j - 1] + 1,     // insertion
                matrix[i - 1][j - 1] + cost // substitution
            );
        }
    }
    
    // Calculate similarity percentage
    const maxLen = Math.max(len1, len2);
    if (maxLen === 0) return 100;
    
    const distance = matrix[len1][len2];
    return ((maxLen - distance) / maxLen) * 100;
}

// Function to reload autoRespData from file
async function reloadAutoResponseData() {
    try {
        const newData = await load('data/configs/autoResponse.json');
        if (newData && Array.isArray(newData)) {
            autoRespData = newData;
            log(`Файл autoResponse.json успешно перезагружен. Загружено ${autoRespData.length} автоответов.`, 'g');
        } else {
            log(`Ошибка перезагрузки autoResponse.json: неверный формат данных.`, 'r');
        }
    } catch (err) {
        log(`Ошибка перезагрузки autoResponse.json: ${err}`, 'r');
    }
}

// Check if pattern matches with fuzzy matching (65% threshold)
function isPatternMatch(userMessage, pattern, threshold = 65) {
    // First check exact match or contains (for backward compatibility)
    if (userMessage === pattern || userMessage.includes(pattern)) {
        return { match: true, similarity: 100, type: 'exact' };
    }
    
    // Then check fuzzy matching
    const similarity = calculateSimilarity(userMessage, pattern);
    if (similarity >= threshold) {
        return { match: true, similarity, type: 'fuzzy' };
    }
    
    // Also check if user message contains words from pattern
    const patternWords = pattern.split(' ').filter(word => word.length > 2);
    const userWords = userMessage.split(' ').filter(word => word.length > 2);
    
    if (patternWords.length > 0 && userWords.length > 0) {
        let matchingWords = 0;
        for (const patternWord of patternWords) {
            for (const userWord of userWords) {
                if (calculateSimilarity(userWord, patternWord) >= threshold) {
                    matchingWords++;
                    break;
                }
            }
        }
        
        const wordSimilarity = (matchingWords / patternWords.length) * 100;
        if (wordSimilarity >= threshold) {
            return { match: true, similarity: wordSimilarity, type: 'word' };
        }
    }
    
    return { match: false, similarity, type: 'none' };
}

async function processMessages() {
    if(isAutoRespBusy) return;
    isAutoRespBusy = true;
    let result = false;

    try {
        const chats = await getChatBookmarks();
        for(let j = 0; j < chats.length; j++) {
            const chat = chats[j];
            
            // Only process unread messages to avoid spamming old contacts
            if(!chat.isUnread) {
                continue; // Skip silently to reduce log noise
            }
            
            // Enhanced message signature for more robust tracking
            const messageSignature = `${chat.node}_${chat.message.trim().toLowerCase()}`;
            
            // Enhanced self-response detection (no cooldown, just self-response prevention)
            const isBotMessage = (
                // Check by username (primary method)
                (global.appData && global.appData.userName && chat.userName === global.appData.userName) ||
                // Check if we recently sent this exact message
                sentMessages.has(messageSignature) ||
                // Check if message contains watermarks
                (settings.watermark && chat.message.includes(settings.watermark)) ||
                (settings.telegramWatermark && chat.message.includes(settings.telegramWatermark)) ||
                // Check known bot response patterns (comprehensive list)
                chat.message.includes('Привет. Чем могу помочь?') ||
                chat.message.includes('Здравствуйте. Готов ответить') ||
                chat.message.includes('Добрый день. Чем могу помочь?') ||
                chat.message.includes('Оплатить можно через удобный способ') ||
                chat.message.includes('Спасибо за покупку') ||
                chat.message.includes('Товар выдан') ||
                // Common bot responses from autoResponse.json
                chat.message.includes('Добро пожаловать') ||
                chat.message.includes('Отличного дня') ||
                chat.message.includes('Как дела?') ||
                // Additional check for recently sent messages (by content similarity)
                isSimilarToRecentBotMessage(chat.message)
            );
            
            if(isBotMessage) {
                log(`Пропускаем сообщение бота: ${c.yellowBright(chat.userName)}`);
                continue;
            }
            
            // Check if auto-responses are paused for this user
            if(isUserPaused(chat.userName)) {
                const remainingMinutes = getRemainingPauseTime(chat.userName);
                log(`Автоответы приостановлены для ${c.yellowBright(chat.userName)} (осталось ${remainingMinutes} мин.)`);
                continue;
            }
    
            // Command logic here
    
            // Enhanced pattern matching for auto-responses
            let responseFound = false;
            for(let i = 0; i < autoRespData.length && !responseFound; i++) {
                const responseConfig = autoRespData[i];
                
                // Legacy support for old command structure
                if(responseConfig.command && chat.message.toLowerCase() == responseConfig.command.toLowerCase()) {
                    log(`Команда: ${c.yellowBright(responseConfig.command)} для пользователя ${c.yellowBright(chat.userName)}.`);
                    let smRes = await sendMessage(chat.node, responseConfig.response, false, 'auto');
                    if(smRes) {
                        log(`Ответ на команду отправлен.`, `g`);
                    }
                    responseFound = true;
                    break;
                }
                
                // New pattern-based matching with fuzzy logic
                if(responseConfig.patterns && responseConfig.responses) {
                    const userMessage = chat.message.toLowerCase().trim();
                    let bestMatch = { match: false, similarity: 0, pattern: '', type: 'none' };
                    
                    // Find the best matching pattern
                    for(let j = 0; j < responseConfig.patterns.length; j++) {
                        const pattern = responseConfig.patterns[j].toLowerCase();
                        const matchResult = isPatternMatch(userMessage, pattern, 65);
                        
                        if(matchResult.match && matchResult.similarity > bestMatch.similarity) {
                            bestMatch = {
                                match: true,
                                similarity: matchResult.similarity,
                                pattern: pattern,
                                type: matchResult.type
                            };
                        }
                    }
                    
                    // If we found a good match, respond
                    if(bestMatch.match) {
                        log(`Найден паттерн: ${c.yellowBright(bestMatch.pattern)} (${bestMatch.similarity.toFixed(1)}% ${bestMatch.type}) для пользователя ${c.yellowBright(chat.userName)}.`);
                        
                        // Select random response
                        const responses = responseConfig.responses;
                        const randomResponse = responses[Math.floor(Math.random() * responses.length)];
                        
                        let smRes = await sendMessage(chat.node, randomResponse, false, 'auto');
                        if(smRes) {
                            log(`Автоответ отправлен.`, `g`);
                        }
                        
                        responseFound = true;
                        break;
                    }
                }
            }
    
            // Custom commands - only process if no auto-response was found
            if(!responseFound && settings.autoIssueTestCommand == true && chat.message.includes("!автовыдача")) {
                const goodName = chat.message.split(`&quot;`)[1];

                if(!goodName) {
                    log(`Команда: ${c.yellowBright('!автовыдача')} для пользователя ${c.yellowBright(chat.userName)}: товар не указан.`, `c`);
                    let smRes = await sendMessage(chat.node, `Товар не указан. Укажите название предложения в кавычках (").`, false, 'auto');
                    if(smRes)
                        log(`Ответ на команду отправлен.`, `g`);
                    break;
                }

                log(`Команда: ${c.yellowBright('!автовыдача')} для пользователя ${c.yellowBright(chat.userName)}:`);
                const { issueGood } = global.sales;
                let issueResult = await issueGood(chat.node, chat.userName, goodName, 'node');

                if(!issueResult) {
                    let smRes = await sendMessage(chat.node, `Товара "${goodName}" нет в списке автовыдачи`, false, 'auto');
                    if(smRes) 
                        log(`Ответ на команду отправлен.`, `g`);
                    break;
                }

                if(issueResult == 'notInStock') {
                    let smRes = await sendMessage(chat.node, `Товар закончился`, false, 'auto');
                    if(smRes)
                        log(`Ответ на команду отправлен.`, `g`);
                    break;
                }
            }
            
            // Check if message contains !followuptest command (regardless of responseFound)
            if (chat.message.includes("!followuptest")) {
                log(`Обнаружена команда !followuptest от пользователя ${c.yellowBright(chat.userName)}`, 'g');
                log(`Текущие настройки: autoIssueTestCommand=${settings.autoIssueTestCommand}, autoResponse=${settings.autoResponse}, responseFound=${responseFound}`, 'c');
            }
            
            // Follow-up message test command - only process if no auto-response was found
            if(!responseFound && settings.autoIssueTestCommand == true && chat.message.includes("!followuptest")) {
                log(`Команда: ${c.yellowBright('!followuptest')} для пользователя ${c.yellowBright(chat.userName)}:`);
                
                // Create a mock order object for testing with all required fields
                const mockOrder = {
                    id: '#TEST-001',
                    buyerName: chat.userName,
                    buyerId: chat.node,
                    price: '100',
                    unit: '₽',
                    name: 'Тестовый товар'
                };
                
                log(`Создан mock order: ${JSON.stringify(mockOrder)}`, 'c');
                
                // Send follow-up message immediately for testing
                log(`Вызов sendFollowUpMessage для пользователя ${chat.userName}`, 'c');
                await global.sales.sendFollowUpMessage(mockOrder);
                
                // Send Telegram notification for the test
                if(global.telegramBot && settings.newOrderNotification) {
                    log(`Отправка уведомления в Telegram о тестовом заказе`, 'c');
                    global.telegramBot.sendNewOrderNotification(mockOrder);
                }
                
                let smRes = await sendMessage(chat.node, `Тестовое follow-up сообщение отправлено.`, false, 'auto');
                if(smRes)
                    log(`Тестовое follow-up сообщение отправлено пользователю ${c.yellowBright(chat.userName)}.`, `g`);
                
                responseFound = true;
                break;
            }
            
            // New order notification test command
            if(!responseFound && settings.autoDeliveryTestCommand == true && chat.message.includes("!ordertest")) {
                log(`Команда: ${c.yellowBright('!ordertest')} для пользователя ${c.yellowBright(chat.userName)}:`);
                
                // Create a mock order object for testing
                const mockOrder = {
                    id: '#TEST-002',
                    buyerName: chat.userName,
                    buyerId: chat.node,
                    price: '100',
                    unit: '₽',
                    name: 'Тестовый товар'
                };
                
                // Send Telegram notification for the test
                if(global.telegramBot && settings.newOrderNotification) {
                    global.telegramBot.sendNewOrderNotification(mockOrder);
                    log(`Тестовое уведомление о новом заказе отправлено в Telegram.`, `g`);
                } else {
                    log(`Телеграм бот или уведомления о заказах отключены.`, `r`);
                }
                
                let smRes = await sendMessage(chat.node, `Тестовое уведомление о новом заказе отправлено в Telegram.`, false, 'auto');
                if(smRes)
                    log(`Подтверждение отправлено пользователю ${c.yellowBright(chat.userName)}.`, `g`);
                
                responseFound = true;
                break;
            }
            
            // Admin pause/unpause commands - only process for bot owner
            if(!responseFound && global.appData && global.appData.userName && chat.userName === global.appData.userName) {
                const message = chat.message.toLowerCase().trim();
                
                // Pause command: !pause [username] [minutes]
                if(message.startsWith('!pause ')) {
                    const parts = message.split(' ');
                    if(parts.length >= 2) {
                        const targetUser = parts[1];
                        const minutes = parts.length > 2 ? parseInt(parts[2]) || 10 : 10;
                        
                        pauseAutoResponseForUser(targetUser, minutes);
                        let smRes = await sendMessage(chat.node, `Автоответы приостановлены для ${targetUser} на ${minutes} мин.`, false, 'manual');
                        if(smRes)
                            log(`Команда паузы выполнена.`, 'g');
                        responseFound = true;
                    }
                }
                
                // Unpause command: !unpause [username]
                else if(message.startsWith('!unpause ')) {
                    const parts = message.split(' ');
                    if(parts.length >= 2) {
                        const targetUser = parts[1];
                        
                        const wasUnpaused = unpauseAutoResponseForUser(targetUser);
                        const responseMsg = wasUnpaused ? 
                            `Автоответы возобновлены для ${targetUser}.` : 
                            `Пользователь ${targetUser} не был на паузе.`;
                        
                        let smRes = await sendMessage(chat.node, responseMsg, false, 'manual');
                        if(smRes)
                            log(`Команда возобновления выполнена.`, 'g');
                        responseFound = true;
                    }
                }
                
                // List paused users command: !pauselist
                else if(message === '!pauselist') {
                    if(pausedUsers.size === 0) {
                        let smRes = await sendMessage(chat.node, `Нет пользователей на паузе.`, false, 'manual');
                    } else {
                        let pauseList = 'Пользователи на паузе:\n';
                        for(const [userName, expiryTime] of pausedUsers.entries()) {
                            const remaining = Math.max(0, expiryTime - Date.now());
                            const minutes = Math.ceil(remaining / (60 * 1000));
                            pauseList += `- ${userName}: ${minutes} мин.\n`;
                        }
                        let smRes = await sendMessage(chat.node, pauseList, false, 'manual');
                        if(smRes)
                            log(`Список пауз отправлен.`, 'g');
                    }
                    responseFound = true;
                }
            }
        }
    } catch (err) {
        log(`Ошибка при автоответе: ${err}`, 'r');
        isAutoRespBusy = false;
    }

    isAutoRespBusy = false;
    return result;
}

// New function to check if a message is similar to recently sent bot messages
function isSimilarToRecentBotMessage(message) {
    // Convert message to lowercase for comparison
    const lowerMessage = message.toLowerCase().trim();
    
    // Check against recently sent messages
    for(const sentMessage of sentMessages) {
        // Extract the message part (after the node_)
        const sentMessageContent = sentMessage.split('_').slice(1).join('_').toLowerCase();
        
        // Check for exact match or substring match
        if(lowerMessage === sentMessageContent || 
           lowerMessage.includes(sentMessageContent) || 
           sentMessageContent.includes(lowerMessage)) {
            return true;
        }
        
        // Check for high similarity using our existing similarity function
        const similarity = calculateSimilarity(lowerMessage, sentMessageContent);
        if(similarity > 80) { // 80% similarity threshold
            return true;
        }
    }
    
    return false;
}

async function processIncomingMessages(message) {
    // Notification
    if(global.telegramBot && settings.newMessageNotification) {
        if(settings.watermark) {
            if(!message.content.includes(settings.watermark)) {
                global.telegramBot.sendNewMessageNotification(message);
            }
        } else {
            global.telegramBot.sendNewMessageNotification(message);
        }
    }

    // Greeting message for new users (independent of notifications)
    if(settings.greetingMessage && settings.greetingMessageText) {
        // Don't send greetings for bot's own messages
        const isBotMessage = (
            (global.appData && global.appData.userName && message.user === global.appData.userName) ||
            (settings.watermark && message.content.includes(settings.watermark)) ||
            (settings.telegramWatermark && message.content.includes(settings.telegramWatermark)) ||
            // Don't greet if message contains greeting text itself (prevent greeting loops)
            message.content.includes('Привет! Продавец скоро ответит') ||
            message.content.includes('Продавец скоро ответит на твоё сообщение')
        );
        
        if(!isBotMessage) {
            const newChatUsers = await load('data/other/newChatUsers.json');

            if(!newChatUsers.includes(message.user)) {
                newChatUsers.push(message.user);

                let msg = settings.greetingMessageText;
                msg = msg.replace('{name}', message.user);

                await updateFile(newChatUsers, 'data/other/newChatUsers.json');

                if(!isSystemMessage(message.content)) {
                    let smRes = await sendMessage(message.node, msg, false, 'auto');
                    if(smRes) {
                        log(`Приветственное сообщение отправлено пользователю ${c.yellowBright(message.user)}.`, `g`);
                        // Remove the incorrect call to markMessageAsRead
                    }
                }

            }
        }
    }
}

async function getMessages(senderId) {
    let result = false;
    try {
        const url = `${getConst('api')}/chat/history?node=users-${global.appData.id}-${senderId}&last_message=1000000000`;
        const headers = { 
            "cookie": `golden_key=${settings.golden_key}`,
            "x-requested-with": "XMLHttpRequest"
        };

        const options = {
            method: 'GET',
            headers: headers
        }

        const resp = await fetch(url, options);
        result = await resp.json();
    } catch (err) {
        log(`Ошибка при получении сообщений: ${err}`, 'r');
    }
    return result;
}

async function getLastMessageId(senderId) {
    let lastMessageId = -1;
    try {
        let chat = await getMessages(senderId);
        if(!chat) return lastMessageId;
        chat = chat['chat'];
        if(!chat) return lastMessageId;

        const messages = chat.messages;
        lastMessageId = messages[messages.length - 1].id;
    } catch (err) {
        log(`Ошибка при получении id сообщения: ${err}`, 'r');
    }

    return lastMessageId;
}

async function sendMessage(node, message, customNode = false, watermarkType = 'auto') {
    // watermarkType options:
    // 'auto' - use auto-response watermark (settings.watermark)
    // 'manual' - use manual/telegram watermark (settings.telegramWatermark) 
    // 'none' - no watermark
    if(!message || message == undefined || !node || node == undefined) return;

    let result = false;

    try {
        let newNode = node;
        const url = `${getConst('api')}/runner/`;
        const headers = {
            "accept": "*/*",
            "cookie": `golden_key=${settings.golden_key}; PHPSESSID=${global.appData.sessid}`,
            "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
            "x-requested-with": "XMLHttpRequest"
        };

        if(customNode) {
            if(newNode > global.appData.id) {
                newNode = `users-${global.appData.id}-${node}`;
            } else {
                newNode = `users-${node}-${global.appData.id}`;
            }
        }

        let reqMessage = message;
        
        // Apply watermark based on type
        if(watermarkType === 'auto' && settings.watermark && settings.watermark != '') {
            reqMessage = `${settings.watermark}\n${message}`;
        } else if(watermarkType === 'manual' && settings.telegramWatermark && settings.telegramWatermark != '') {
            reqMessage = `${settings.telegramWatermark}\n${message}`;
        }

        const request = {
            "action": "chat_message",
            "data": {
                "node": newNode,
                "last_message": -1,
                "content": reqMessage
            }
        };

        const params = new URLSearchParams();
        params.append('objects', '');
        params.append('request', JSON.stringify(request));
        params.append('csrf_token', global.appData.csrfToken);

        const options = {
            method: 'POST',
            body: params,
            headers: headers
        };

        log(`Отправка сообщения: node=${newNode}, message=${reqMessage}`, 'c');
        log(`Запрос: ${JSON.stringify(options)}`, 'c');

        const resp = await fetch(url, options);
        const json = await resp.json();

        log(`Ответ от сервера: ${JSON.stringify(json)}`, 'c');

        if(json.response && json.response.error == null) {
            log(`Сообщение отправлено, чат node ${c.yellowBright(newNode)}.`, 'g');
            
            // Track sent message to prevent self-response
            const messageSignature = `${newNode}_${message.substring(0, 50).trim()}`;
            sentMessages.add(messageSignature);
            
            // Clean up old messages (keep only last 100 to prevent memory leak)
            if(sentMessages.size > 100) {
                const oldMessages = Array.from(sentMessages).slice(0, sentMessages.size - 100);
                oldMessages.forEach(msg => sentMessages.delete(msg));
            }
            
            result = json;
        } else {
            log(`Не удалось отправить сообщение, node: "${newNode}", сообщение: "${reqMessage}"`, 'r');
            log(`Запрос:`);
            log(options);
            log(`Ответ:`);
            log(json);
            result = false;
        }
    } catch (err) {
        log(`Ошибка при отправке сообщения: ${err}`, 'r');
    }
    return result;
}

async function getNodeByUserName(userName) {
    let node = null;

    try {
        const bookmarks = await getChatBookmarks();
        if(!bookmarks) return null;

        for(let i = 0; i < bookmarks.length; i++) {
            const chat = bookmarks[i];

            if(chat.userName == userName) {
                node = chat.node;
                break;
            }
        }
    } catch(err) {
        log(`Ошибка при получении node: ${err}`, 'e');
    }

    return node;
}

async function getChatBookmarks() {
    let result = [];
    try {
        const url = `${getConst('api')}/runner/`;
        const headers = {
            "accept": "*/*",
            "cookie": `golden_key=${settings.golden_key}; PHPSESSID=${global.appData.sessid}`,
            "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
            "x-requested-with": "XMLHttpRequest"
        };
    
        const chat_bookmarks =  {
            "type": "chat_bookmarks",
            "id": `${global.appData.id}`,
            "tag": `${getRandomTag()}`,
            "data": false
        };
    
        const objects = [chat_bookmarks];
        const params = new URLSearchParams();
        params.append('objects', JSON.stringify(objects));
        params.append('request', false);
        params.append('csrf_token', global.appData.csrfToken);
    
        const options = {
            method: 'POST',
            body: params,
            headers: headers
        };
    
        const resp = await fetch(url, options);
        const json = await resp.json();
    
        const html = json.objects[0].data.html;
    
        const doc = parseDOM(html);
        const chats = doc.querySelectorAll(".contact-item");
    
        for(let i = 0; i < chats.length; i++) {
            const chat = chats[i];
            
            let userName = chat.querySelector('.media-user-name').innerHTML;
            let message = chat.querySelector('.contact-item-message').innerHTML;
            let time = chat.querySelector('.contact-item-time').innerHTML;
            let node = chat.getAttribute('data-id');
            let isUnread = chat.getAttribute('class').includes('unread');
    
            result.push({
                userName: userName,
                message: message,
                time: time,
                node: node,
                isUnread: isUnread
            });
        }
    
        return result;
    } catch (err) {
        log(`Ошибка при получении списка сообщений: ${err}`, 'e');
    }
}

async function addUsersToFile() {
    try {
        const bookmarks = await getChatBookmarks();
        if(!bookmarks) return;

        let users = await load('data/other/newChatUsers.json');
        for(let i = 0; i < bookmarks.length; i++) {
            const chat = bookmarks[i];
            if(!users.includes(chat.userName))
                users.push(chat.userName);
        }

        await updateFile(users, 'data/other/newChatUsers.json');
    } catch(err) {
        log(`Ошибка при получении списка пользователей: ${err}`, 'e');
    }
}

function isSystemMessage(message) {
    if(!message) return false;

    if(message.includes('Покупатель') || message.includes('The buyer')) {
        return true;
    }

    return false;
}

export { 
    getMessages, 
    sendMessage, 
    getChatBookmarks, 
    processMessages, 
    processIncomingMessages,
    addUsersToFile, 
    enableAutoResponse, 
    getLastMessageId, 
    getNodeByUserName,
    pauseAutoResponseForUser,
    unpauseAutoResponseForUser,
    isUserPaused,
    getRemainingPauseTime,
    getPausedUsersInfo,
    reloadAutoResponseData
};
