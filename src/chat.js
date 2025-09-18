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
// Track conversation history for users (username -> array of messages)
const conversationHistory = new Map();
// Track buffered messages for users (username -> {messages: array, timer: timeout})
const messageBuffers = new Map();
let isAutoRespBusy = false;

// Buffer settings (now configurable through settings.txt)
const MESSAGE_BUFFER_DELAY = global.settings.messageBufferDelay || 3000; // 3 seconds to wait for more messages
const MAX_BUFFER_TIME = global.settings.maxBufferTime || 10000; // Maximum 10 seconds to wait

log(`Message buffering settings loaded: delay=${MESSAGE_BUFFER_DELAY}ms, max=${MAX_BUFFER_TIME}ms`, 'c');

function enableAutoResponse() {
    log(`Автоответ запущен.`, 'g');
}

// Function to buffer messages from the same user
function bufferUserMessage(userName, message, node) {
    log(`Попытка буферизации сообщения от пользователя ${c.yellowBright(userName)}: "${message}"`, 'c');
    
    // If buffering is disabled (delay = 0), process immediately
    if (MESSAGE_BUFFER_DELAY <= 0) {
        log(`Буферизация отключена, немедленная обработка сообщения от пользователя ${c.yellowBright(userName)}`, 'c');
        processCombinedMessage(userName, message, node);
        return false; // Not buffered, processed immediately
    }
    
    // If this is the first message from this user, create a buffer
    if (!messageBuffers.has(userName)) {
        messageBuffers.set(userName, {
            messages: [{ text: message, timestamp: Date.now() }],
            timer: null,
            node: node,
            firstTimestamp: Date.now()
        });
        
        // Set a timer to process the buffered messages
        const buffer = messageBuffers.get(userName);
        buffer.timer = setTimeout(() => {
            processBufferedMessages(userName);
        }, MESSAGE_BUFFER_DELAY);
        
        log(`Начало буферизации сообщений для пользователя ${c.yellowBright(userName)}`, 'c');
        return true; // Message is buffered
    }
    
    // Add message to existing buffer
    const buffer = messageBuffers.get(userName);
    buffer.messages.push({ text: message, timestamp: Date.now() });
    buffer.node = node; // Update node in case it changed
    
    // Check if we've exceeded the maximum buffer time
    const timeSinceFirstMessage = Date.now() - buffer.firstTimestamp;
    if (timeSinceFirstMessage >= MAX_BUFFER_TIME) {
        log(`Превышено максимальное время буферизации для пользователя ${c.yellowBright(userName)}, принудительная обработка`, 'c');
        processBufferedMessages(userName);
        return true; // Message was processed
    }
    
    // Reset timer to wait for more messages
    clearTimeout(buffer.timer);
    buffer.timer = setTimeout(() => {
        processBufferedMessages(userName);
    }, MESSAGE_BUFFER_DELAY);
    
    log(`Добавлено сообщение в буфер для пользователя ${c.yellowBright(userName)}. Всего сообщений: ${buffer.messages.length}`, 'c');
    return true; // Message is buffered
}

// Function to process buffered messages
async function processBufferedMessages(userName) {
    // Clear the buffer
    const buffer = messageBuffers.get(userName);
    if (!buffer) return;
    
    // Clear the timer
    clearTimeout(buffer.timer);
    messageBuffers.delete(userName);
    
    // Combine all messages into one
    const combinedMessage = buffer.messages
        .map(msg => msg.text)
        .join(' ')
        .trim();
    
    log(`Обработка буферизованных сообщений для пользователя ${c.yellowBright(userName)}. Объединенное сообщение: "${combinedMessage}"`, 'g');
    
    // Process the combined message as usual
    await processCombinedMessage(userName, combinedMessage, buffer.node);
}

// Function to process a combined message with Google Sheets FAQ
async function processCombinedMessage(userName, combinedMessage, node) {
    try {
        log(`Попытка инициализации Google Sheets FAQ для объединенного сообщения от пользователя ${userName}`, 'c');
        
        // Initialize Google Sheets FAQ if not already done
        if(!global.googleSheetsFAQ) {
            log(`Google Sheets FAQ не инициализирован, создаем новый экземпляр`, 'c');
            
            // Validate required settings
            if (!global.settings.googleSheetsId || !global.settings.googleSheetsServiceAccountPath) {
                log(`Ошибка: Не заданы обязательные параметры Google Sheets (ID или путь к файлу сервисного аккаунта)`, 'r');
                return;
            }
            
            try {
                const GoogleSheetsFAQ = global.googlesheets.default;
                log(`Конструктор GoogleSheetsFAQ доступен, создание экземпляра`, 'c');
                
                global.googleSheetsFAQ = new GoogleSheetsFAQ(
                    global.settings.googleSheetsId,
                    global.settings.googleSheetsServiceAccountPath,
                    global.settings.googleSheetsRange || 'FAQ!A:B',
                    global.settings.googleSheetsGeminiApiKey || null,
                    global.settings.googleSheetsFeedbackSheetName || 'Feedback',
                    global.settings.googleSheetsContextSheetName || 'Context',
                    global.settings.googleSheetsAccountsSheetName || 'Accounts'
                );
                
                log(`Экземпляр GoogleSheetsFAQ создан, проверка: ${global.googleSheetsFAQ ? 'УСПЕШНО' : 'НЕ УДАЛОСЬ'}`, 'c');
                
                if (global.googleSheetsFAQ) {
                    log(`Экземпляр GoogleSheetsFAQ создан, загрузка данных FAQ`, 'c');
                    
                    // Load FAQ data
                    const faqLoaded = await global.googleSheetsFAQ.refreshFAQData();
                    if (!faqLoaded) {
                        log(`Не удалось загрузить данные из Google Sheets FAQ. Проверьте настройки.`, 'r');
                        // Even if loading fails, we still have the instance
                        log(`Google Sheets FAQ instance available but data loading failed`, 'y');
                    } else {
                        log(`Google Sheets FAQ успешно инициализирован. Загружено ${global.googleSheetsFAQ.getFAQData().length} записей.`, 'g');
                    }
                } else {
                    log(`Ошибка: Не удалось создать экземпляр GoogleSheetsFAQ`, 'r');
                    return;
                }
            } catch (initErr) {
                log(`Ошибка при создании экземпляра GoogleSheetsFAQ: ${initErr}`, 'r');
                log(`Стек ошибки: ${initErr.stack}`, 'r');
                global.googleSheetsFAQ = null; // Ensure it's null on error
                return;
            }
        }
        
        // Try to find answer in FAQ (now with Gemini support)
        if (global.googleSheetsFAQ) {
            log(`Поиск ответа в Google Sheets FAQ для объединенного сообщения: ${combinedMessage}`, 'c');
            try {
                // Create conversation history for this user
                const userConversationHistory = await getConversationHistory(userName);
                log(`Получена история беседы для пользователя ${userName}: ${userConversationHistory.length} сообщений`, 'c');
                
                // Log the conversation history for debugging
                if (userConversationHistory.length > 0) {
                    const lastMessages = userConversationHistory.slice(-3);
                    log(`Последние сообщения в истории: ${JSON.stringify(lastMessages)}`, 'c');
                }
                
                const answer = await global.googleSheetsFAQ.findAnswerWithGemini(combinedMessage, userName, userConversationHistory);
                if(answer) {
                    // Save the user's message to conversation history BEFORE sending the response
                    log(`Сохранение объединенного сообщения пользователя в истории беседы для пользователя ${userName}`, 'c');
                    await saveConversationHistory(userName, {
                        sender: 'user',
                        text: combinedMessage,
                        timestamp: Date.now()
                    });
                    
                    // Check if the answer needs to be chunked into multiple messages
                    const chunkedAnswers = global.googleSheetsFAQ.chunkLongMessage(answer);
                    let allMessagesSent = true;
                    
                    // Send each chunk as a separate message with a small delay between them
                    for (let i = 0; i < chunkedAnswers.length; i++) {
                        const chunk = chunkedAnswers[i];
                        
                        // Add a small delay between messages to avoid rate limiting
                        if (i > 0) {
                            await new Promise(resolve => setTimeout(resolve, 1000)); // 1 second delay
                        }
                        
                        let smRes = await sendMessage(node, chunk, false, 'auto');
                        if(!smRes) {
                            allMessagesSent = false;
                            log(`Не удалось отправить часть сообщения ${i+1} из ${chunkedAnswers.length} пользователю ${c.yellowBright(userName)}.`, 'r');
                        } else {
                            log(`Отправлена часть сообщения ${i+1} из ${chunkedAnswers.length} пользователю ${c.yellowBright(userName)}.`, 'g');
                        }
                    }
                    
                    if(allMessagesSent) {
                        log(`Все части ответа из Google Sheets FAQ (возможно с помощью Gemini) отправлены пользователю ${c.yellowBright(userName)}.`, `g`);
                        
                        // Save the bot's response to conversation history (using the full answer)
                        await saveConversationHistory(userName, {
                            sender: 'bot',
                            text: answer,
                            timestamp: Date.now()
                        });
                        log(`История беседы сохранена для пользователя ${userName}`, 'g');
                    }
                } else {
                    log(`Ответ в Google Sheets FAQ не найден для объединенного сообщения: ${combinedMessage}`, 'c');
                    // Even if no answer found, still save the user's message to conversation history
                    log(`Сохранение объединенного сообщения пользователя в истории беседы для пользователя ${userName} (не найден ответ)`, 'c');
                    await saveConversationHistory(userName, {
                        sender: 'user',
                        text: combinedMessage,
                        timestamp: Date.now()
                    });
                }

            } catch (findErr) {
                log(`Ошибка при поиске ответа в Google Sheets FAQ: ${findErr}`, 'r');
                log(`Стек ошибки: ${findErr.stack}`, 'r');
                // Even if there's an error, still save the user's message to conversation history
                log(`Сохранение объединенного сообщения пользователя в истории беседы для пользователя ${userName} (ошибка поиска)`, 'c');
                await saveConversationHistory(userName, {
                    sender: 'user',
                    text: combinedMessage,
                    timestamp: Date.now()
                });
            }
        } else {
            log(`Google Sheets FAQ не доступен для поиска ответа`, 'r');
            // Even if Google Sheets FAQ is not available, still save the user's message to conversation history
            log(`Сохранение объединенного сообщения пользователя в истории беседы для пользователя ${userName} (Google Sheets недоступен)`, 'c');
            await saveConversationHistory(userName, {
                sender: 'user',
                text: combinedMessage,
                timestamp: Date.now()
            });
        }
    } catch (err) {
        log(`Ошибка при обработке объединенного запроса к Google Sheets FAQ: ${err}`, 'r');
        log(`Стек ошибки: ${err.stack}`, 'r');
    }
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

// Save conversation history for a user
function saveConversationHistory(userName, message) {
    log(`Сохранение сообщения в истории беседы для пользователя: ${userName}`, 'c');
    log(`Сообщение: ${JSON.stringify(message)}`, 'c');
    
    if (!conversationHistory.has(userName)) {
        conversationHistory.set(userName, []);
    }
    
    const userHistory = conversationHistory.get(userName);
    userHistory.push(message);
    
    // Keep only the last 20 messages to avoid memory issues
    if (userHistory.length > 20) {
        userHistory.shift();
    }
    
    log(`История беседы для пользователя ${userName} теперь содержит ${userHistory.length} сообщений`, 'g');
}

// Get conversation history for a user
function getConversationHistory(userName) {
    if (conversationHistory.has(userName)) {
        const history = conversationHistory.get(userName);
        log(`Получена история беседы для пользователя ${userName}: ${history.length} сообщений`, 'c');
        return [...history]; // Return a copy to prevent external modifications
    }
    log(`Нет истории беседы для пользователя ${userName}`, 'c');
    return [];
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

// Check if pattern matches with fuzzy matching (85% threshold)
function isPatternMatch(userMessage, pattern, threshold = 85) {
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
                        const matchResult = isPatternMatch(userMessage, pattern);
                        
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
    
            // Check Google Sheets FAQ if no response found and Google Sheets is configured
            if(!responseFound && global.settings.googleSheetsFAQEnabled) {
                log(`Попытка обработки сообщения через Google Sheets FAQ для пользователя ${c.yellowBright(chat.userName)}: "${chat.message}"`, 'c');
                
                // Buffer messages from the same user to combine them into a single request
                const isBuffered = bufferUserMessage(chat.userName, chat.message, chat.node);
                log(`Сообщение от пользователя ${c.yellowBright(chat.userName)} было буферизовано: ${isBuffered}`, 'c');
                
                // Mark response as found to prevent other processors from handling this message
                responseFound = true;
                
                // Continue to the next message - the buffered messages will be processed later
                continue;
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
                    buyerId: chat.node, // This is already in the correct format for sending messages
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
                            pauseList += `- ${userName} (${minutes} мин.)\n`;
                        }
                        let smRes = await sendMessage(chat.node, pauseList, false, 'manual');
                    }
                    responseFound = true;
                }
                
                // Help command: !help
                else if(message === '!help') {
                    const helpText = `Доступные команды:\n` +
                        `!pause [пользователь] [минуты] - Приостановить автоответы\n` +
                        `!unpause [пользователь] - Возобновить автоответы\n` +
                        `!pauselist - Список пользователей на паузе\n` +
                        `!help - Показать эту справку`;
                    let smRes = await sendMessage(chat.node, helpText, false, 'manual');
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

            // Check if this is actually a new user by checking conversation history
            const userConversationHistory = await getConversationHistory(message.user);
            const hasConversationHistory = userConversationHistory.length > 0;

            if(!newChatUsers.includes(message.user) && !hasConversationHistory) {
                newChatUsers.push(message.user);

                let msg = settings.greetingMessageText;
                msg = msg.replace('{name}', message.user);

                await updateFile(newChatUsers, 'data/other/newChatUsers.json');

                if(!isSystemMessage(message.content)) {
                    log(`Отправка приветственного сообщения пользователю ${c.yellowBright(message.user)}`, 'c');
                    let smRes = await sendMessage(message.node, msg, false, 'auto');
                    if(smRes) {
                        log(`Приветственное сообщение отправлено пользователю ${c.yellowBright(message.user)}.`, `g`);
                        // Remove the incorrect call to markMessageAsRead
                        
                        // Also save this greeting in the conversation history
                        await saveConversationHistory(message.user, {
                            sender: 'bot',
                            text: msg,
                            timestamp: Date.now()
                        });
                    }
                }
            }
            // If user already has conversation history, don't send greeting but still save their message
            else if (hasConversationHistory) {
                log(`Пользователь ${message.user} уже имеет историю беседы, приветствие не отправляется`, 'c');
                // Save the user's message to conversation history
                await saveConversationHistory(message.user, {
                    sender: 'user',
                    text: message.content,
                    timestamp: Date.now()
                });
            } else {
                log(`Пользователь ${message.user} уже в списке новых пользователей, приветствие не отправляется`, 'c');
                // Still save the user's message to conversation history
                await saveConversationHistory(message.user, {
                    sender: 'user',
                    text: message.content,
                    timestamp: Date.now()
                });
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
            
            // Save bot response to conversation history
            // Extract username from node if possible
            try {
                const userName = await getNodeUserName(newNode);
                if (userName) {
                    await saveConversationHistory(userName, {
                        sender: 'bot',
                        text: reqMessage,
                        timestamp: Date.now()
                    });
                    log(`Сообщение бота сохранено в истории беседы для пользователя ${userName}`, 'g');
                }
            } catch (err) {
                log(`Не удалось сохранить сообщение бота в истории: ${err}`, 'y');
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

// Helper function to get username from node
async function getNodeUserName(node) {
    try {
        // Try to get username from conversation history first
        for (const [userName, history] of conversationHistory.entries()) {
            // Check if any message in history has this node
            for (const msg of history) {
                if (msg.node && msg.node === node) {
                    return userName;
                }
            }
        }
        
        // If not found in conversation history, try to get from chat bookmarks
        const bookmarks = await getChatBookmarks();
        if (bookmarks) {
            for (const chat of bookmarks) {
                if (chat.node === node) {
                    return chat.userName;
                }
            }
        }
        
        return null;
    } catch (err) {
        log(`Ошибка при получении имени пользователя по node: ${err}`, 'y');
        return null;
    }
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