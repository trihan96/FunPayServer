// MODULES
import fs from 'fs/promises';

import { fileURLToPath } from 'url';
import { dirname } from 'path';

// Import Google Sheets API client
import { google } from 'googleapis';

// Import SOCKS proxy agent for Gemini API
import { SocksProxyAgent } from 'socks-proxy-agent';

// Get current directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Define a fallback log function if not available
const log = global.log || function(message, color = 'white') {
    const colors = {
        'r': '\x1b[31m', // red
        'g': '\x1b[32m', // green
        'c': '\x1b[36m', // cyan
        'y': '\x1b[33m', // yellow
        'w': '\x1b[37m', // white
        'default': '\x1b[0m' // reset
    };
    
    const colorCode = colors[color] || colors['default'];
    console.log(`${colorCode}${message}\x1b[0m`);
};

// System prompt for Gemini AI
const SYSTEM_PROMPT = `Ты — цифровой ассистент для продавца прокачанных аккаунтов на FunPay. Ты дружелюбный, вежливый и профессиональный. Отвечай строго на основе информации ниже. 

[ПРАВИЛА ОТВЕТОВ]
- НЕ выдумывай информацию. Если не знаешь — отвечай: "Передам ваш вопрос менеджеру, он свяжется с вами".
- НЕ обсуждай политику, религию, здоровье.
- Всегда используй проверенные данные из FAQ и списка доступных аккаунтов.
- Используй смайлы для дружелюбия: 🎮, 💰, ✅, 📩
- При вопросах о безопасности и политике, подчеркивай, что все продаваемые аккаунты легитимны и соответствуют правилам FunPay

[РАБОТА С АККАУНТАМИ]
- Всегда предлагай конкретные аккаунты из списка доступных.
- При вопросах об аккаунтах предоставь конкретные варианты с полными ссылками.
- Если пользователь спрашивает о конкретной игре, поищи аккаунты именно для этой игры.
- Если пользователь хочет "самый жирный" или "самый прокачанный" аккаунт, предложи аккаунты с высоким уровнем прокачки.
- ВСЕГДА предоставляй прямую ссылку на аккаунт когда пользователь спрашивает о конкретном аккаунте или хочет его купить.
- Ссылки на аккаунты имеют формат: https://funpay.com/lots/offer?id=ID где ID - это уникальный идентификатор аккаунта.
- КОГДА пользователь просит ссылку на аккаунт, ОБЯЗАТЕЛЬНО предоставь полную ссылку в формате: https://funpay.com/lots/offer?id=ID
- НИКОГДА НЕ говори "К сожалению, ссылки на аккаунты отсутствуют в предоставленной информации" - у тебя всегда есть доступ к списку аккаунтов.
- ЕСЛИ в списке аккаунтов есть аккаунты, подходящие под запрос пользователя, ВСЕГДА показывай их с полными ссылками.
- НЕ ограничивай количество отображаемых аккаунтов - показывай все доступные аккаунты.

[УПРАВЛЕНИЕ КОНТЕКСТОМ]
- ЕСЛИ в контексте беседы видно, что это продолжение диалога (есть предыдущие сообщения), ТО НЕЛЬЗЯ начинать с приветствий.
- В продолжении диалога переходи сразу к сути ответа, учитывая предыдущую переписку.
- Приветствия допустимы ТОЛЬКО в самом первом сообщении диалога с пользователем.
- ЕСЛИ контекст беседы отсутствует, ТО можно использовать приветствие.
- ЕСЛИ контекст беседы присутствует, ТО НЕЛЬЗЯ использовать приветствия.

[ПРИОРИТЕТЫ СООБЩЕНИЙ]
- Вопросы пользователей имеют высший приоритет перед ответами бота
- Сообщения с упоминанием аккаунтов, покупок, цен, ссылок, оплаты и заказов имеют повышенную важность
- Более новые сообщения имеют больший вес, чем старые

[ГРУППИРОВКА ПО ТЕМАМ]
- Группируй сообщения по темам: аккаунты, оплата, доставка, технические вопросы
- Сохраняй контекст в рамках каждой темы для лучшего понимания запросов пользователя

[УБЕДИТЕЛЬНОСТЬ И МОТИВАЦИЯ]
- Формулируй ответы так, чтобы клиент чувствовал доверие и уверенность в покупке.
- Подчеркивай легитимность аккаунтов и честность прокачки.
- Всегда подтверждай, что клиент получает полный доступ к аккаунту, почте и всем данным.
- Используй позитивные и уверенные формулировки: "полностью безопасно", "вы получаете полный контроль", "аккаунт легитимен и проверен".
- При возможности мотивируй к покупке: упоминай доступность, прокачанность, выгоду, ограниченность предложения.
- Никогда не вводи клиента в сомнения;`;

// Google Sheets integration for FAQ data with Gemini AI support
class GoogleSheetsFAQ {
    constructor(spreadsheetId, serviceAccountPath = './config/service-account-key.json', range = 'FAQ!A:B', geminiApiKey = null, feedbackSheetName = 'Feedback', contextSheetName = 'Context', accountsSheetName = 'Accounts') {
        log(`GoogleSheetsFAQ constructor called with:`, 'c');
        log(`  spreadsheetId: ${spreadsheetId}`, 'c');
        log(`  serviceAccountPath: ${serviceAccountPath}`, 'c');
        log(`  range: ${range}`, 'c');
        log(`  geminiApiKey: ${geminiApiKey ? 'SET' : 'NOT SET'}`, 'c');
        log(`  feedbackSheetName: ${feedbackSheetName}`, 'c');
        log(`  contextSheetName: ${contextSheetName}`, 'c');
        log(`  accountsSheetName: ${accountsSheetName}`, 'c');
        log(`  Current directory: ${__dirname}`, 'c');
        
        this.spreadsheetId = spreadsheetId;
        this.serviceAccountPath = serviceAccountPath;
        this.range = range;
        this.geminiApiKey = geminiApiKey;
        this.feedbackSheetName = feedbackSheetName; // Name of the feedback worksheet/tab
        this.contextSheetName = contextSheetName; // Name of the context worksheet/tab
        this.accountsSheetName = accountsSheetName; // Name of the accounts worksheet/tab
        this.faqData = [];
        this.isGeminiEnabled = !!geminiApiKey;
        this.pendingResponses = new Map(); // Store pending responses for approval
        this.lastGeminiRequest = 0; // Track last Gemini API request time
        this.geminiRequestDelay = 1000; // Minimum delay between requests (1 second)
        this.cacheTimeout = 30 * 1000; // 30 seconds cache timeout (reduced from 5 minutes)
        this.lastUpdate = null; // Track last cache update time
        this.sheetsClient = null; // Google Sheets client
        this.auth = null; // Google Auth client
        
        log(`GoogleSheetsFAQ instance created successfully`, 'g');
    }

    // Check if service account credentials exist
    async hasServiceAccount() {
        try {
            await fs.access(this.serviceAccountPath);
            return true;
        } catch {
            return false;
        }
    }

    // Initialize Google Sheets API with Service Account (JWT authentication)
    async initSheetsClient() {
        try {
            log(`Инициализация Google Sheets клиента с сервисным аккаунтом: ${this.serviceAccountPath}`, 'c');
            
            // Check if service account file exists
            if (!await this.hasServiceAccount()) {
                log(`Ошибка: Файл учетных данных сервисного аккаунта не найден: ${this.serviceAccountPath}`, 'r');
                return false;
            }

            if (!this.spreadsheetId) {
                log(`Ошибка: GOOGLE_SHEETS_ID не задан`, 'r');
                return false;
            }

            // Load service account credentials
            const credentials = JSON.parse(await fs.readFile(this.serviceAccountPath, 'utf8'));
            
            // Create JWT auth client - using the constructor pattern from older versions
            this.auth = new google.auth.JWT(
                credentials.client_email,
                null,
                credentials.private_key,
                ['https://www.googleapis.com/auth/spreadsheets']
            );

            // Authorize the client
            await this.auth.authorize();
            
            // Initialize Sheets API
            this.sheetsClient = google.sheets({ version: 'v4', auth: this.auth });
            
            log(`✅ Google Sheets API initialized successfully`, 'g');
            return true;
        } catch (error) {
            log(`❌ Failed to initialize Google Sheets: ${error.message}`, 'r');
            log(`Stack trace: ${error.stack}`, 'r');
            return false;
        }
    }

    // Test connection to Google Sheets
    async testConnection() {
        try {
            if (!this.sheetsClient) {
                await this.initSheetsClient();
            }

            // Try to read spreadsheet metadata
            const response = await this.sheetsClient.spreadsheets.get({
                spreadsheetId: this.spreadsheetId
            });

            log(`✅ Connected to: "${response.data.properties.title}"`, 'g');
            return true;
        } catch (error) {
            log(`❌ Connection test failed: ${error.message}`, 'r');
            return false;
        }
    }

    // Check if cache needs refresh
    isCacheExpired() {
        if (!this.lastUpdate) return true;
        return (Date.now() - this.lastUpdate) > this.cacheTimeout;
    }
    
    // Force refresh of all data including accounts
    async forceRefresh() {
        log(`Force refreshing all data from Google Sheets`, 'c');
        try {
            // Refresh FAQ data
            await this.refreshFAQData();
            
            // Also refresh accounts data by clearing lastUpdate to force refresh
            this.lastUpdate = null;
            
            log(`Force refresh completed`, 'g');
            return true;
        } catch (error) {
            log(`Error during force refresh: ${error.message}`, 'r');
            return false;
        }
    }

    // Fetch FAQ data from Google Sheets using service account
    async fetchFAQData() {
        try {
            log(`Попытка загрузки данных FAQ из Google Sheets`, 'c');
            
            // Initialize sheets client if not already done
            if (!this.sheetsClient) {
                const initSuccess = await this.initSheetsClient();
                if (!initSuccess) {
                    log(`Не удалось инициализировать клиент Google Sheets`, 'r');
                    return false;
                }
            }
            
            log(`Клиент Google Sheets инициализирован, попытка получения данных из таблицы: ${this.spreadsheetId}`, 'c');
            log(`Диапазон данных: ${this.range}`, 'c');
            
            // Fetch data from Google Sheets
            const response = await this.sheetsClient.spreadsheets.values.get({
                spreadsheetId: this.spreadsheetId,
                range: this.range
            });
            
            log(`Ответ от Google Sheets API получен`, 'c');
            log(`Данные ответа: ${response.data ? 'PRESENT' : 'MISSING'}`, 'c');
            
            const data = response.data;
            
            // Parse the data into question-answer pairs
            if (data.values && data.values.length > 1) {
                // Skip header row and convert to array of objects
                this.faqData = [];
                for (let i = 1; i < data.values.length; i++) {
                    const row = data.values[i];
                    if (row.length >= 2) {
                        this.faqData.push({
                            question: row[0],
                            answer: row[1]
                        });
                    }
                }
                log(`Загружено ${this.faqData.length} записей FAQ из Google Sheets`, 'g');
                this.lastUpdate = Date.now(); // Update cache timestamp
                return true;
            } else {
                log(`Нет данных в Google Sheets для диапазона ${this.range}`, 'r');
                log(`Полученные данные: ${JSON.stringify(data, null, 2)}`, 'r');
                return false;
            }
        } catch (err) {
            log(`Ошибка при загрузке данных из Google Sheets: ${err}`, 'r');
            log(`Стек ошибки: ${err.stack}`, 'r');
            
            // Check if it's a specific Google API error
            if (err.response && err.response.data) {
                log(`Детали ошибки Google API: ${JSON.stringify(err.response.data, null, 2)}`, 'r');
            }
            
            return false;
        }
    }

    // Find answer for a given question using improved matching algorithm
    findAnswer(question) {
        if (!this.faqData || this.faqData.length === 0) {
            return null;
        }
        
        const normalizedQuestion = question.toLowerCase().trim();
        
        // SKIP FAQ MATCHING FOR ENGLISH MESSAGES
        // Simple language detection: if message contains mostly Latin characters, assume it's English
        const latinCharCount = (normalizedQuestion.match(/[a-z]/g) || []).length;
        const totalCharCount = normalizedQuestion.length;
        const latinRatio = totalCharCount > 0 ? latinCharCount / totalCharCount : 0;
        
        if (latinRatio > 0.5) { // More than 50% Latin characters
            return null;
        }
        
        // Try exact match first
        let match = this.faqData.find(faq => 
            faq.question.toLowerCase().trim() === normalizedQuestion
        );
            
        // Special handling for questions about buying accounts or bans
        if (!match && (normalizedQuestion.includes('buy') || normalizedQuestion.includes('покуп') || normalizedQuestion.includes('ban') || normalizedQuestion.includes('запрет') || normalizedQuestion.includes('banned') || normalizedQuestion.includes('забан'))) {
            // Look for more specific FAQ entries that address buying or bans
            match = this.faqData.find(faq => 
                (faq.question.toLowerCase().includes('buy') || faq.question.toLowerCase().includes('покуп') || 
                 faq.question.toLowerCase().includes('ban') || faq.question.toLowerCase().includes('запрет') || 
                 faq.question.toLowerCase().includes('banned') || faq.question.toLowerCase().includes('забан')) &&
                (faq.question.toLowerCase().includes('account') || faq.question.toLowerCase().includes('аккаунт'))
            );
        }
        
        // Try partial match with better relevance scoring
        if (!match) {
            let bestMatch = null;
            let bestScore = 0;
            
            for (const faq of this.faqData) {
                const faqWords = faq.question.toLowerCase().split(' ');
                const questionWords = normalizedQuestion.split(' ');
                
                // Count matching words
                const matches = faqWords.filter(word => 
                    word.length > 3 && questionWords.includes(word)
                );
                
                const score = matches.length;
                
                // Must have at least 2 matches for longer questions, or exact match for short questions
                const minScore = questionWords.length > 3 ? 2 : questionWords.length;
                if (score >= minScore && score > bestScore) {
                    bestScore = score;
                    bestMatch = faq;
                }
            }
            
            match = bestMatch;
        }
        
        // Try keyword matching as last resort - but make it more specific
        if (!match) {
            // Only match if we have substantial keyword overlap, not just one common word
            const questionWords = normalizedQuestion.split(' ').filter(word => word.length > 2);
            
            // Don't match single-word queries unless they're very specific
            if (questionWords.length === 1) {
                const singleWord = questionWords[0];
                // Only allow single-word matches for very specific terms
                const specificTerms = ['доставка', 'оплата', 'график', 'время', 'адрес', 'телефон', 'цена', 'стоимость', 'аккаунт', 'игр'];
                if (!specificTerms.includes(singleWord)) {
                    // For general terms, don't match unless it's part of a longer query
                    return null;
                }
            }
            
            for (const faq of this.faqData) {
                const faqKeywords = this.extractKeywords(faq.question);
                const questionKeywords = this.extractKeywords(normalizedQuestion);
                
                // Find common keywords
                const commonKeywords = questionKeywords.filter(keyword => 
                    faqKeywords.includes(keyword)
                );
                
                // Need at least 2 common keywords for a match, or all keywords for very short queries
                // But also require that the common keywords represent a significant portion of the FAQ keywords
                const minCommon = Math.min(2, Math.max(1, questionKeywords.length));
                const faqKeywordRatio = commonKeywords.length / Math.max(1, faqKeywords.length);
                
                if (commonKeywords.length >= minCommon && faqKeywordRatio > 0.3) {
                    match = faq;
                    break;
                }
            }
        }
        
        return match ? match.answer : null;
    }
    
    // Extract key words from text for matching with improved logic
    extractKeywords(text) {
        // Remove punctuation and convert to lowercase
        const cleanText = text.toLowerCase().replace(/[^\w\sа-яё]/g, ' ');
        
        // Split into words
        const words = cleanText.split(/\s+/).filter(word => word.length > 0);
        
        // Common important words for FunPay business with their variations
        const importantWordGroups = [
            ['аккаунт', 'аккаунты', 'account', 'accounts'],
            ['игр', 'игра', 'игры', 'game', 'games'],
            ['доставка', 'доставить', 'delivery'],
            ['оплат', 'оплата', 'оплатить', 'payment', 'pay'],
            ['заказ', 'заказать', 'заказы', 'order', 'orders'],
            ['отмен', 'отменить', 'отмена', 'cancel', 'cancellation'],
            ['цен', 'цена', 'стоимост', 'стоимость', 'price', 'cost'],
            ['покупк', 'покупать', 'покупка', 'buy', 'purchase'],
            ['ссылк', 'ссылка', 'link'],
            ['funpay'],
            ['arena', 'breakout', 'арена', 'брейкаут']
        ];
        
        const keywords = [];
        const processedWords = new Set();
        
        words.forEach(word => {
            // Skip if already processed
            if (processedWords.has(word)) {
                return;
            }
            
            // Add word to processed set
            processedWords.add(word);
            
            // Check if word matches any important word groups
            let isImportant = false;
            for (const group of importantWordGroups) {
                if (group.some(imp => word.includes(imp))) {
                    isImportant = true;
                    // Add all variations of the important word
                    group.forEach(variation => keywords.push(variation));
                    break;
                }
            }
            
            // Add words that are longer than 3 characters or are important
            if (word.length > 3 || isImportant) {
                keywords.push(word);
            }
        });
        
        // Remove duplicates and return
        return [...new Set(keywords)];
    }

    // Use Gemini AI to generate an answer when no exact match is found
    async generateAnswerWithGemini(question, userName = null, conversationHistory = []) {
        if (!this.isGeminiEnabled || !this.geminiApiKey) {
            return null;
        }

        // Validate Gemini API key
        if (!this.geminiApiKey || this.geminiApiKey.trim() === '') {
            log(`Ошибка: API ключ Gemini не задан или пуст для генерации ответа`, 'r');
            return null;
        }

        try {
            // Implement rate limiting to prevent quota exhaustion
            const now = Date.now();
            const timeSinceLastRequest = now - this.lastGeminiRequest;
            
            if (timeSinceLastRequest < this.geminiRequestDelay) {
                const delay = this.geminiRequestDelay - timeSinceLastRequest;
                log(`Ожидание ${delay} мс перед следующим запросом к Gemini API для предотвращения превышения квоты`, 'c');
                await new Promise(resolve => setTimeout(resolve, delay));
            }
            
            this.lastGeminiRequest = Date.now();
            
            // Prepare context with FAQ data
            let context = "Вы - помощник по FAQ. Используйте следующую информацию для ответа на вопросы:\n\n";
            for (const faq of this.faqData) {
                context += `Вопрос: ${faq.question}\nОтвет: ${faq.answer}\n\n`;
            }

            // Add accounts data to context if available
            try {
                // Force refresh accounts data for account-related queries
                const isAccountQuery = question.toLowerCase().includes('аккаунт') || 
                                     question.toLowerCase().includes('account') ||
                                     question.toLowerCase().includes('arena breakout');
                
                // If this is an account query or cache is expired, force refresh
                if (isAccountQuery || this.isCacheExpired()) {
                    log(`Forcing data refresh for account query or expired cache`, 'c');
                    await this.forceRefresh();
                }
                
                const accounts = await this.getAccountsData();
                log(`Retrieved ${accounts.length} accounts for context`, 'c');
                if (accounts && accounts.length > 0) {
                    context += "🎮 ДОСТУПНЫЕ АККАУНТЫ ДЛЯ ПРОДАЖИ:\n";
                    // Filter only "In Stock" accounts
                    const inStockAccounts = accounts.filter(account => account.Status === "In Stock");
                    log(`Found ${inStockAccounts.length} in-stock accounts`, 'c');
                    
                    // Group accounts by game
                    const accountsByGame = {};
                    inStockAccounts.forEach(account => {
                        if (!accountsByGame[account.Game]) {
                            accountsByGame[account.Game] = [];
                        }
                        accountsByGame[account.Game].push(account);
                    });
                    
                    // Add accounts to context, grouped by game
                    for (const [game, gameAccounts] of Object.entries(accountsByGame)) {
                        context += `\n🎯 ИГРА: ${game} (${gameAccounts.length} аккаунтов)\n`;
                        // Sort accounts by price (ascending) to show cheaper options first
                        gameAccounts.sort((a, b) => {
                            const priceA = parseFloat(a.Price) || 0;
                            const priceB = parseFloat(b.Price) || 0;
                            return priceA - priceB;
                        });
                        
                        // Show all available accounts without artificial limitation
                        gameAccounts.forEach(account => {
                            const priceInfo = account.Price ? ` (💰 ${account.Price})` : '';
                            // Ensure the link is in the correct format
                            let accountLink = account.Link || '';
                            if (accountLink.includes('chat/?node=')) {
                                // Convert old format to new format
                                const nodeId = accountLink.split('=').pop();
                                accountLink = `https://funpay.com/lots/offer?id=${nodeId}`;
                            }
                            // Make the link more prominent with a dedicated line and better formatting
                            context += `  🔹 ${account["Account Parameters"]}${priceInfo}\n     📎 Ссылка: ${accountLink}\n`;
                        });
                    }
                    context += "\n";
                } else {
                    log(`No accounts retrieved or accounts list is empty`, 'c');
                }
            } catch (err) {
                log(`Ошибка при получении данных об аккаунтах: ${err}`, 'r');
                log(`Stack trace: ${err.stack}`, 'r');
            }

            // If we have too much context, summarize it
            if (context.length > 30000) {
                context = context.substring(0, 30000) + "\n... (контекст сокращен для экономии токенов)";
            }
            
            // Add conversation context if available
            let conversationContext = "";
            if (userName) {
                // First, check if we have in-memory conversation history (more recent)
                if (conversationHistory.length > 0) {
                    // Use provided conversation history
                    const lastMessages = conversationHistory.slice(-5);
                    const historyString = lastMessages.map(msg => `${msg.sender}: ${msg.text}`).join('\n');
                    const contextSummary = this.createContextSummary(conversationHistory);
                    
                    conversationContext = `\n\n[КОНТЕКСТ БЕСЕДЫ НАЧАЛО]\n`;
                    conversationContext += `ТЕКУЩИЙ КОНТЕКСТ БЕСЕДЫ С ПОЛЬЗОВАТЕЛЕМ ${userName}:\n`;
                    conversationContext += `ТЕМЫ БЕСЕДЫ: ${contextSummary}\n`;
                    conversationContext += `ПОСЛЕДНИЕ СООБЩЕНИЯ:\n${historyString}\n`;
                    conversationContext += `[КОНТЕКСТ БЕСЕДЫ КОНЕЦ]\n`;
                    log(`Добавлен текущий контекст для пользователя ${userName}`, 'c');
                } else {
                    // Try to get conversation context from Google Sheets as fallback
                    const userContext = await this.getConversationContext(userName);
                    if (userContext) {
                        conversationContext = `\n\n[КОНТЕКСТ БЕСЕДЫ НАЧАЛО]\n`;
                        conversationContext += `ТЕКУЩИЙ КОНТЕКСТ БЕСЕДЫ С ПОЛЬЗОВАТЕЛЕМ ${userName}:\n`;
                        conversationContext += `ТЕМЫ ПРЕДЫДУЩЕЙ БЕСЕДЫ: ${userContext.contextSummary}\n`;
                        conversationContext += `ПОСЛЕДНИЕ СООБЩЕНИЯ:\n${userContext.historyString}\n`;
                        conversationContext += `[КОНТЕКСТ БЕСЕДЫ КОНЕЦ]\n`;
                        log(`Добавлен контекст из Google Sheets для пользователя ${userName}`, 'c');
                    } else {
                        conversationContext = `\n\n[КОНТЕКСТ БЕСЕДЫ НАЧАЛО]\n`;
                        conversationContext += `ЭТО ПЕРВОЕ СООБЩЕНИЕ ОТ ПОЛЬЗОВАТЕЛЯ ${userName} (КОНТЕКСТ ОТСУТСТВУЕТ)\n`;
                        conversationContext += `[КОНТЕКСТ БЕСЕДЫ КОНЕЦ]\n`;
                        log(`Нет контекста для пользователя ${userName}`, 'c');
                    }
                }
            }

            const prompt = `${SYSTEM_PROMPT}\n\n${context}${conversationContext}\n\nПользователь спрашивает: "${question}"\n\nОтветите как можно более точно и по существу, используя предоставленную информацию. Если вы не можете найти точный ответ в предоставленной информации, скажите, что не можете ответить на этот вопрос. Пожалуйста, учитывайте контекст предыдущей беседы при формулировании ответа. ВАЖНО: Если это продолжение диалога (видно из контекста), НЕ начинайте ответ с приветствий, переходите сразу к сути.\n\nОСОБЫЕ ИНСТРУКЦИИ ПО ОБРАБОТКЕ ВОПРОСОВ:\n1. Если вопрос касается покупки аккаунтов другими людьми или возможных запретов, объясните, что мы только продаем аккаунты и не отвечаем за политику других сервисов\n2. Если вопрос касается безопасности, подчеркните, что все продаваемые аккаунты легитимны и соответствуют правилам FunPay\n3. Если вопрос касается рисков, упомяните, что пользователь должен сам ознакомиться с правилами платформы FunPay`;

            // Validate Gemini API key before making request
            if (!this.geminiApiKey || this.geminiApiKey.trim() === '') {
                log(`Ошибка: API ключ Gemini не задан или пуст`, 'r');
                return null;
            }

            // Use Gemini 1.5 Flash which has better quota limits
            // Prepare fetch options
            const fetchOptions = {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    contents: [{
                        parts: [{
                            text: prompt
                        }]
                    }]
                })
            };
            
            // Add SOCKS5 proxy agent if enabled in settings
            const settings = global.settings || {};
            const geminiSocks5Proxy = settings.geminiSocks5Proxy || {};
            
            if (geminiSocks5Proxy.enabled && geminiSocks5Proxy.host && geminiSocks5Proxy.port) {
                try {
                    let socksProxyUrl;
                    if (geminiSocks5Proxy.username && geminiSocks5Proxy.password) {
                        // Use authenticated SOCKS5 proxy
                        socksProxyUrl = `socks5://${geminiSocks5Proxy.username}:${geminiSocks5Proxy.password}@${geminiSocks5Proxy.host}:${geminiSocks5Proxy.port}`;
                    } else {
                        // Use unauthenticated SOCKS5 proxy
                        socksProxyUrl = `socks5://${geminiSocks5Proxy.host}:${geminiSocks5Proxy.port}`;
                    }
                    const agent = new SocksProxyAgent(socksProxyUrl);
                    fetchOptions.agent = agent;
                    log(`Using SOCKS5 proxy for Gemini API: ${socksProxyUrl}`, 'c');
                } catch (proxyError) {
                    log(`Failed to create SOCKS5 proxy agent: ${proxyError.message}`, 'r');
                }
            }
            
            const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${this.geminiApiKey}`, fetchOptions);

            const data = await response.json();
            
            if (data.error) {
                log(`Ошибка Gemini API: ${data.error.message}`, 'r');
                
                // Handle quota exceeded errors specifically
                if (data.error.message.includes('quota') || data.error.message.includes('limit')) {
                    log(`Превышена квота Gemini API. Попробуйте позже или добавьте платежную информацию в Google Cloud Console.`, 'r');
                    log(`Используйте модель gemini-1.5-flash вместо gemini-1.5-pro для лучшей квоты.`, 'r');
                } else {
                    log(`Проверьте правильность API ключа и доступность модели`, 'r');
                }
                
                return null;
            }

            if (data.candidates && data.candidates[0] && data.candidates[0].content) {
                const answer = data.candidates[0].content.parts[0].text.trim();
                // Return the full answer without any chunking - let the program handle it
                return answer;
            }

            return null;
        } catch (err) {
            log(`Ошибка при генерации ответа с помощью Gemini: ${err}`, 'r');
            return null;
        }
    }

    // Enhanced findAnswer method that uses Gemini as fallback
    async findAnswerWithGemini(question, userName = null, conversationHistory = []) {
        // Refresh cache if expired
        if (this.isCacheExpired()) {
            log(`Обновление кэша данных FAQ из Google Sheets`, 'c');
            await this.refreshFAQData();
        }
        
        // Log context information for debugging
        log(`findAnswerWithGemini вызван для пользователя: ${userName}`, 'c');
        log(`Вопрос: ${question}`, 'c');
        log(`Длина истории беседы: ${conversationHistory.length}`, 'c');
        if (conversationHistory.length > 0) {
            const lastMessages = conversationHistory.slice(-3);
            log(`Последние сообщения: ${JSON.stringify(lastMessages)}`, 'c');
        }
        
        // FIRST PRIORITY: Try AI response if Gemini is enabled
        if (this.isGeminiEnabled) {
            log(`Генерация ответа с помощью Gemini AI для вопроса: ${question.substring(0, 50)}...`, 'c');
            const aiAnswer = await this.generateAnswerWithGemini(question, userName, conversationHistory);
            
            // If we generated an AI answer, save it for potential feedback and return it
            if (aiAnswer) {
                log(`Сгенерирован ответ с помощью Gemini AI`, 'g');
                // Create a unique ID for this question-answer pair
                const questionId = this.generateQuestionId(question);
                
                // Store the pending response
                this.pendingResponses.set(questionId, {
                    question: question,
                    aiAnswer: aiAnswer,
                    timestamp: new Date().toISOString(),
                    status: 'pending' // pending, approved, rejected
                });
                
                // Save to feedback sheet if configured
                if (this.feedbackSheetName) {
                    await this.savePendingResponseToSheet(questionId, question, aiAnswer, conversationHistory);
                }
                
                // Save conversation context if configured
                if (this.contextSheetName) {
                    await this.saveConversationContext(userName, question, aiAnswer, conversationHistory);
                }
                
                return aiAnswer;
            }
        }

        // SECOND PRIORITY: If AI fails or is disabled, try fuzzy matching as fallback
        log(`AI не дал ответа, пробуем fuzzy matching для вопроса: ${question.substring(0, 50)}...`, 'c');
        const fuzzyMatch = this.findAnswer(question);
        if (fuzzyMatch) {
            log(`Найден ответ через fuzzy matching для вопроса: ${question.substring(0, 50)}...`, 'g');
            return fuzzyMatch;
        }

        return null;
    }

    // Generate a unique ID for a question
    generateQuestionId(question) {
        return Buffer.from(question).toString('base64').substring(0, 10);
    }

    // Save pending response to Google Sheets for feedback (same spreadsheet, different worksheet)
    async savePendingResponseToSheet(questionId, question, aiAnswer, conversationHistory = []) {
        try {
            // Validate feedback sheet name
            if (!this.feedbackSheetName || this.feedbackSheetName.trim() === '') {
                log(`Ошибка: Имя листа обратной связи не задано`, 'r');
                return false;
            }
            
            // Initialize sheets client if not already done
            if (!this.sheetsClient) {
                const initSuccess = await this.initSheetsClient();
                if (!initSuccess) {
                    return false;
                }
            }
            
            // Append data to Google Sheets feedback worksheet
            const response = await this.sheetsClient.spreadsheets.values.append({
                spreadsheetId: this.spreadsheetId, // Same spreadsheet
                range: `${this.feedbackSheetName}!A:E`, // Updated to include 5 columns
                valueInputOption: 'RAW',
                requestBody: {
                    values: [[
                        questionId,
                        question,
                        aiAnswer,
                        '', // correct answer (empty initially)
                        'pending' // status
                    ]]
                }
            });

            log(`Ответ сохранен в лист обратной связи: ${questionId}`, 'g');
            return true;
        } catch (err) {
            log(`Ошибка при сохранении ответа в Google Sheets: ${err}`, 'r');
            return false;
        }
    }

    // Update the status of a pending response in Google Sheets
    async updatePendingResponseStatus(questionId, status, approvedAnswer = null) {
        try {
            // Update in memory
            if (this.pendingResponses.has(questionId)) {
                const pendingResponse = this.pendingResponses.get(questionId);
                pendingResponse.status = status;
                
                if (approvedAnswer) {
                    pendingResponse.correctAnswer = approvedAnswer; // Store approved answer as correct answer
                }
                
                // If approved, add to FAQ data
                if (status === 'approved' && approvedAnswer) {
                    this.faqData.push({
                        question: pendingResponse.question,
                        answer: approvedAnswer
                    });
                }
            }
            
            // Update in Google Sheets if feedback sheet is configured
            if (this.feedbackSheetName) {
                // Find the row with this questionId and update its status
                await this.updatePendingResponseInSheet(questionId, status, approvedAnswer);
            }
            
            return true;
        } catch (err) {
            log(`Ошибка при обновлении статуса ответа: ${err}`, 'r');
            return false;
        }
    }

    // Update pending response in Google Sheets
    async updatePendingResponseInSheet(questionId, status, approvedAnswer = null) {
        try {
            // Initialize sheets client if not already done
            if (!this.sheetsClient) {
                const initSuccess = await this.initSheetsClient();
                if (!initSuccess) {
                    return false;
                }
            }
            
            // Get all data from the feedback sheet to find the row
            const response = await this.sheetsClient.spreadsheets.values.get({
                spreadsheetId: this.spreadsheetId,
                range: `${this.feedbackSheetName}!A:E`
            });
            
            const rows = response.data.values;
            if (!rows || rows.length === 0) {
                log(`Нет данных в листе обратной связи ${this.feedbackSheetName}`, 'r');
                return false;
            }
            
            // Find the row with the matching questionId
            let rowIndex = -1;
            for (let i = 1; i < rows.length; i++) { // Start from 1 to skip header
                if (rows[i][0] === questionId) {
                    rowIndex = i + 1; // Google Sheets is 1-indexed
                    break;
                }
            }
            
            if (rowIndex === -1) {
                log(`Не найдена запись с ID ${questionId} в листе обратной связи`, 'r');
                return false;
            }
            
            // Update the status in column E (index 4)
            const updateRange = `${this.feedbackSheetName}!E${rowIndex}`;
            const updateValues = [[status]];
            
            await this.sheetsClient.spreadsheets.values.update({
                spreadsheetId: this.spreadsheetId,
                range: updateRange,
                valueInputOption: 'RAW',
                requestBody: {
                    values: updateValues
                }
            });
            
            // If approved and we have an approved answer, update column D (index 3)
            if (status === 'approved' && approvedAnswer) {
                const answerRange = `${this.feedbackSheetName}!D${rowIndex}`;
                const answerValues = [[approvedAnswer]];
                
                await this.sheetsClient.spreadsheets.values.update({
                    spreadsheetId: this.spreadsheetId,
                    range: answerRange,
                    valueInputOption: 'RAW',
                    requestBody: {
                        values: answerValues
                    }
                });
            }
            
            log(`Статус ответа ${questionId} обновлен на: ${status}`, 'g');
            return true;
        } catch (err) {
            log(`Ошибка при обновлении ответа в Google Sheets: ${err}`, 'r');
            return false;
        }
    }

    // Get all pending responses for review
    getPendingResponses() {
        const pending = [];
        for (const [id, response] of this.pendingResponses.entries()) {
            if (response.status === 'pending') {
                pending.push({
                    id: id,
                    question: response.question,
                    aiAnswer: response.aiAnswer,
                    correctAnswer: response.correctAnswer || '', // Include correct answer if available
                    timestamp: response.timestamp
                });
            }
        }
        return pending;
    }

    // Load pending responses from Google Sheets
    async loadPendingResponsesFromSheet() {
        try {
            // Validate feedback sheet name
            if (!this.feedbackSheetName || this.feedbackSheetName.trim() === '') {
                log(`Ошибка: Имя листа обратной связи не задано`, 'r');
                return false;
            }
            
            // Initialize sheets client if not already done
            if (!this.sheetsClient) {
                const initSuccess = await this.initSheetsClient();
                if (!initSuccess) {
                    return false;
                }
            }
            
            // Get all data from the feedback sheet
            const response = await this.sheetsClient.spreadsheets.values.get({
                spreadsheetId: this.spreadsheetId,
                range: `${this.feedbackSheetName}!A:E`
            });
            
            const rows = response.data.values;
            
            if (!rows || rows.length <= 1) { // Header row + at least one data row
                log(`Нет данных в листе обратной связи ${this.feedbackSheetName}`, 'c');
                return true; // Not an error, just no data
            }
            
            // Clear existing pending responses
            this.pendingResponses.clear();
            
            // Parse rows and load pending responses with 'pending' status
            for (let i = 1; i < rows.length; i++) { // Start from 1 to skip header
                const row = rows[i];
                
                // Check if row has enough columns (at least 5)
                if (row.length >= 5) {
                    const questionId = row[0];
                    const question = row[1];
                    const aiAnswer = row[2];
                    const correctAnswer = row[3]; // New column for correct answer
                    const status = row[4]; // Status is now in the 5th column (index 4)
                    
                    // Only load responses with 'pending' status
                    if (status === 'pending') {
                        this.pendingResponses.set(questionId, {
                            question: question,
                            aiAnswer: aiAnswer,
                            correctAnswer: correctAnswer, // Store the correct answer
                            timestamp: new Date().toISOString(), // Use current time as we don't have the original timestamp
                            status: status
                        });
                    }
                }
            }
            
            log(`Загружено ${this.pendingResponses.size} ожидающих ответов из листа обратной связи`, 'g');
            return true;
        } catch (err) {
            log(`Ошибка при загрузке ожидающих ответов из Google Sheets: ${err}`, 'r');
            return false;
        }
    }

    // Get all FAQ data
    getFAQData() {
        return this.faqData;
    }

    // Refresh FAQ data
    async refreshFAQData() {
        try {
            const success = await this.fetchFAQData();
            if (success) {
                this.lastUpdate = Date.now();
                log(`Кэш FAQ данных обновлен. Загружено ${this.faqData.length} записей`, 'g');
                
                // Also load pending responses from sheet
                await this.loadPendingResponsesFromSheet();
            }
            return success;
        } catch (error) {
            log(`Ошибка при обновлении кэша FAQ данных: ${error.message}`, 'r');
            return false;
        }
    }

    // Enable or disable Gemini functionality
    setGeminiApiKey(apiKey) {
        this.geminiApiKey = apiKey;
        this.isGeminiEnabled = !!apiKey;
    }
    
    // Set feedback sheet name
    setFeedbackSheetName(sheetName) {
        this.feedbackSheetName = sheetName;
    }
    
    // Score conversation context relevance for prioritization with enhanced logic
    scoreContextRelevance(conversationHistory) {
        if (!conversationHistory || conversationHistory.length === 0) {
            return [];
        }
        
        // Score each message based on multiple factors
        const scoredMessages = conversationHistory.map((message, index) => {
            let score = 0;
            
            // Factor 1: Sender type (user messages are more important)
            if (message.sender === 'user') {
                score += 5; // Increased weight for user messages
            } else {
                score += 1;
            }
            
            // Factor 2: Message length (neither too short nor too long)
            const length = message.text.length;
            if (length > 10 && length < 500) {
                score += 3; // Increased weight
            } else if (length >= 500) {
                score += 1; // Still relevant but too long
            } else if (length > 0) {
                score += 1; // Very short messages still have some value
            }
            
            // Factor 3: Recency (more recent messages are more relevant)
            const recencyScore = ((index + 1) / conversationHistory.length) * 4; // Increased weight
            score += recencyScore;
            
            // Factor 4: Keywords indicating importance
            const importantKeywords = ['аккаунт', 'покупк', 'цен', 'стоимост', 'ссылк', 'funpay', 'оплат', 'заказ', 'доставк', 'игр', 'arena', 'breakout'];
            const text = message.text.toLowerCase();
            
            // Count multiple occurrences of important keywords
            importantKeywords.forEach(keyword => {
                const matches = (text.match(new RegExp(keyword, 'g')) || []).length;
                score += matches * 1.5; // Weight multiple occurrences
            });
            
            // Factor 5: Question detection (questions are more important)
            if (text.includes('?') || text.includes('сколько') || text.includes('как') || text.includes('где') || text.includes('когда')) {
                score += 2;
            }
            
            return {
                message: message,
                score: Math.round(score * 100) / 100, // Round to 2 decimal places
                index: index
            };
        });
        
        // Sort by score (descending)
        return scoredMessages.sort((a, b) => b.score - a.score);
    }
    
    // Create a summary of the conversation context with improved relevance scoring and topic grouping
    createContextSummary(conversationHistory) {
        if (!conversationHistory || conversationHistory.length === 0) {
            return 'Нет истории разговора';
        }
        
        // Log for debugging
        log(`Создание сводки контекста для ${conversationHistory.length} сообщений`, 'c');
        
        // Take only the last 15 messages for summary (increased from 10)
        const lastMessages = conversationHistory.slice(-15);
        
        // Extract key topics/keywords from the conversation
        const allText = lastMessages.map(msg => msg.text).join(' ');
        const keywords = this.extractKeywords(allText);
        
        // Create a more detailed summary with message types
        const userMessages = lastMessages.filter(msg => msg.sender === 'user').length;
        const botMessages = lastMessages.filter(msg => msg.sender === 'bot').length;
        
        // Extract main topics from the conversation with relevance scoring
        const mainTopics = this.scoreKeywordsByRelevance(keywords, lastMessages).slice(0, 10).join(', ');
        
        // Group messages by topics
        const topicGroups = this.groupMessagesByTopic(lastMessages);
        
        // Create a compact summary with topic grouping
        const summary = `Темы: ${mainTopics} | Сообщений: ${userMessages} от пользователя, ${botMessages} от бота | Группы: ${Object.keys(topicGroups).join(', ')}`;
        log(`Сводка контекста создана: ${summary}`, 'c');
        return summary;
    }
    
    // Score keywords by relevance to identify most important topics
    scoreKeywordsByRelevance(keywords, messages) {
        const keywordScores = {};
        
        // Initialize scores
        keywords.forEach(keyword => {
            keywordScores[keyword] = 0;
        });
        
        // Score keywords based on frequency and message importance
        messages.forEach(message => {
            const text = message.text.toLowerCase();
            keywords.forEach(keyword => {
                // Count occurrences
                const count = (text.match(new RegExp(keyword, 'g')) || []).length;
                // Weight user messages more heavily than bot messages
                const weight = message.sender === 'user' ? 1.5 : 1.0;
                keywordScores[keyword] += count * weight;
            });
        });
        
        // Sort keywords by score (descending)
        return Object.keys(keywordScores).sort((a, b) => keywordScores[b] - keywordScores[a]);
    }
    
    // Group messages by topics for better context management
    groupMessagesByTopic(messages) {
        const topicGroups = {};
        
        // Define topic keywords
        const topicKeywords = {
            'аккаунты': ['аккаунт', 'account', 'accounts', 'arena', 'breakout', 'арена', 'брейкаут'],
            'оплата': ['оплат', 'оплата', 'оплатить', 'payment', 'pay', 'цен', 'цена', 'стоимост', 'стоимость', 'price', 'cost'],
            'заказы': ['заказ', 'заказать', 'заказы', 'order', 'orders', 'покупк', 'покупать', 'покупка', 'buy', 'purchase'],
            'доставка': ['доставк', 'доставить', 'delivery', 'выдач', 'выдать'],
            'технические вопросы': ['не работает', 'ошибка', 'проблем', 'не открывается', 'техническ', 'support']
        };
        
        messages.forEach(message => {
            const text = message.text.toLowerCase();
            let assigned = false;
            
            // Check each topic
            for (const [topic, keywords] of Object.entries(topicKeywords)) {
                if (keywords.some(keyword => text.includes(keyword))) {
                    if (!topicGroups[topic]) {
                        topicGroups[topic] = [];
                    }
                    topicGroups[topic].push(message);
                    assigned = true;
                    break;
                }
            }
            
            // If no topic matched, assign to general
            if (!assigned) {
                if (!topicGroups['общие']) {
                    topicGroups['общие'] = [];
                }
                topicGroups['общие'].push(message);
            }
        });
        
        return topicGroups;
    }
    
    // Categorize a message by its topic
    categorizeMessage(text) {
        const categories = [];
        
        // Define topic keywords
        const topicKeywords = {
            'аккаунты': ['аккаунт', 'account', 'accounts', 'arena', 'breakout', 'арена', 'брейкаут'],
            'оплата': ['оплат', 'оплата', 'оплатить', 'payment', 'pay', 'цен', 'цена', 'стоимост', 'стоимость', 'price', 'cost'],
            'заказы': ['заказ', 'заказать', 'заказы', 'order', 'orders', 'покупк', 'покупать', 'покупка', 'buy', 'purchase'],
            'доставка': ['доставк', 'доставить', 'delivery', 'выдач', 'выдать'],
            'технические вопросы': ['не работает', 'ошибка', 'проблем', 'не открывается', 'техническ', 'support']
        };
        
        const lowerText = text.toLowerCase();
        
        // Check each topic
        for (const [topic, keywords] of Object.entries(topicKeywords)) {
            if (keywords.some(keyword => lowerText.includes(keyword))) {
                categories.push(topic);
            }
        }
        
        return categories;
    }
    
    // Compress conversation history for storage with advanced techniques
    compressConversationHistory(conversationHistory) {
        if (!conversationHistory || conversationHistory.length === 0) {
            return '';
        }
        
        // Take only the last 20 messages to keep more context (increased from 15)
        const lastMessages = conversationHistory.slice(-20);
        
        // Apply advanced compression techniques:
        // 1. Summarize older messages
        // 2. Priority-based retention (user questions > bot responses)
        // 3. Topic-based grouping
        
        // Score context relevance to prioritize important information
        const scoredMessages = this.scoreContextRelevance(lastMessages);
        
        // Keep top 12 most relevant messages (increased from 10)
        const relevantMessages = scoredMessages.slice(0, 12)
            .map(item => item.message)
            .sort((a, b) => a.timestamp - b.timestamp); // Maintain chronological order
        
        // Group messages by topics for better organization
        const topicGroups = this.groupMessagesByTopic(relevantMessages);
        
        // Process each topic group with priority-based retention
        const prioritizedMessages = [];
        
        // Process each topic group
        for (const [topic, messages] of Object.entries(topicGroups)) {
            // Sort messages by relevance score within the topic
            const topicScoredMessages = this.scoreContextRelevance(messages);
            
            // Keep more user messages than bot messages
            const topicUserMessages = topicScoredMessages.filter(item => item.message.sender === 'user');
            const topicBotMessages = topicScoredMessages.filter(item => item.message.sender === 'bot');
            
            // Add all high-scoring user messages
            topicUserMessages.forEach(item => {
                prioritizedMessages.push(item.message);
            });
            
            // Add bot messages with reduced priority (keep every other one)
            for (let i = 0; i < topicBotMessages.length; i += 2) {
                prioritizedMessages.push(topicBotMessages[i].message);
            }
        }
        
        // Sort by timestamp to maintain conversation flow
        prioritizedMessages.sort((a, b) => a.timestamp - b.timestamp);
        
        // Create a compact representation with topic grouping
        const compressed = prioritizedMessages.map(msg => {
            // Truncate long messages but preserve important information
            let truncatedText = msg.text;
            if (msg.text.length > 150) { // Increased limit from 100
                // For long messages, try to preserve key information
                if (msg.sender === 'user') {
                    // For user messages, preserve the beginning which usually contains the question
                    truncatedText = msg.text.substring(0, 147) + '...';
                } else {
                    // For bot messages, preserve both beginning and end which usually contain key info
                    const start = msg.text.substring(0, 72); // Increased from 48
                    const end = msg.text.substring(msg.text.length - 73); // Increased from 49
                    truncatedText = start + '...' + end;
                }
            }
            
            // Add topic categorization
            const topics = this.categorizeMessage(msg.text);
            const topicTag = topics.length > 0 ? `[${topics[0]}] ` : '';
            
            return `${msg.sender[0].toUpperCase()}: ${topicTag}${truncatedText}`;
        }).join(' | ');
        
        return compressed;
    }
    
    // Save conversation context to Google Sheets with compressed storage
    async saveConversationContext(userName, question, aiAnswer, conversationHistory = []) {
        try {
            log(`Сохранение контекста беседы в Google Sheets для пользователя: ${userName}`, 'c');
            log(`Вопрос: ${question}`, 'c');
            log(`Ответ ИИ: ${aiAnswer}`, 'c');
            log(`Длина истории беседы: ${conversationHistory.length}`, 'c');
            
            // Validate context sheet name
            if (!this.contextSheetName || this.contextSheetName.trim() === '') {
                log(`Ошибка: Имя листа контекста не задано`, 'r');
                return false;
            }
            
            // Initialize sheets client if not already done
            if (!this.sheetsClient) {
                const initSuccess = await this.initSheetsClient();
                if (!initSuccess) {
                    return false;
                }
            }
            
            // Get existing conversation context for this user
            let existingContext = '';
            try {
                const userContext = await this.getConversationContext(userName);
                if (userContext && userContext.historyString) {
                    existingContext = userContext.historyString;
                }
            } catch (err) {
                log(`Не удалось получить существующий контекст: ${err}`, 'y');
            }
            
            // Format new conversation history as a compact string
            let newHistoryString = '';
            if (conversationHistory.length > 0) {
                newHistoryString = this.compressConversationHistory(conversationHistory);
                log(`Сжатая история беседы для сохранения: ${newHistoryString}`, 'c');
            }
            
            // Combine existing context with new history
            let combinedHistory = existingContext;
            if (combinedHistory) {
                combinedHistory += ' | ' + newHistoryString;
            } else {
                combinedHistory = newHistoryString;
            }
            
            // Limit the combined history to prevent overflow (keep last 500 characters)
            if (combinedHistory.length > 500) {
                combinedHistory = combinedHistory.substring(combinedHistory.length - 500);
            }
            
            // Create a summary of the conversation context
            const contextSummary = this.createContextSummary(conversationHistory);
            log(`Сводка контекста для сохранения: ${contextSummary}`, 'c');
            
            // First, try to update existing conversation for this user
            const updateSuccess = await this.updateConversationContext(userName, question, aiAnswer, contextSummary, combinedHistory);
            
            if (!updateSuccess) {
                // If update failed, append as new entry
                log(`Добавление новой записи контекста для пользователя ${userName}`, 'c');
                const response = await this.sheetsClient.spreadsheets.values.append({
                    spreadsheetId: this.spreadsheetId, // Same spreadsheet
                    range: `${this.contextSheetName}!A:E`,
                    valueInputOption: 'RAW',
                    requestBody: {
                        values: [[
                            userName,
                            new Date().toISOString(),
                            contextSummary,
                            combinedHistory,
                            `${question}\n\nAI Ответ: ${aiAnswer}`
                        ]]
                    }
                });
                
                log(`Контекст беседы сохранен для пользователя: ${userName}`, 'g');
            }
            
            return true;
        } catch (err) {
            log(`Ошибка при сохранении контекста беседы в Google Sheets: ${err}`, 'r');
            return false;
        }
    }
    
    // Update existing conversation context for a user
    async updateConversationContext(userName, question, aiAnswer, contextSummary, historyString) {
        try {
            log(`Попытка обновления контекста беседы для пользователя: ${userName}`, 'c');
            
            // Get all data from the context sheet
            const response = await this.sheetsClient.spreadsheets.values.get({
                spreadsheetId: this.spreadsheetId,
                range: `${this.contextSheetName}!A:E`
            });
            
            const rows = response.data.values;
            
            if (!rows || rows.length <= 1) { // Header row + at least one data row
                log(`Нет данных в листе контекста ${this.contextSheetName} для обновления`, 'c');
                return false; // No existing data to update
            }
            
            log(`Получено ${rows.length} строк данных из листа контекста для обновления`, 'c');
            
            // Find the most recent conversation for this user
            let rowIndex = -1;
            let latestTimestamp = null;
            
            for (let i = 1; i < rows.length; i++) { // Start from 1 to skip header
                const row = rows[i];
                
                // Check if row has enough columns
                if (row.length >= 5) {
                    const rowUserName = row[0];
                    const timestamp = row[1];
                    
                    log(`Проверка строки ${i} для обновления: пользователь=${rowUserName}, время=${timestamp}`, 'c');
                    
                    // Check if this row is for the requested user
                    if (rowUserName === userName) {
                        log(`Найдена запись для обновления пользователя ${userName} со временем ${timestamp}`, 'c');
                        // Check if this is the most recent conversation
                        if (!latestTimestamp || timestamp > latestTimestamp) {
                            latestTimestamp = timestamp;
                            rowIndex = i + 1; // Google Sheets is 1-indexed
                            log(`Обновлен индекс строки для обновления: ${rowIndex}`, 'c');
                        }
                    }
                }
            }
            
            // If we found an existing conversation, update it
            if (rowIndex !== -1) {
                log(`Обновление существующей записи контекста для пользователя ${userName} в строке ${rowIndex}`, 'c');
                // Update the entire row with new data
                const updateRange = `${this.contextSheetName}!A${rowIndex}:E${rowIndex}`;
                const updateValues = [[
                    userName,
                    new Date().toISOString(),
                    contextSummary, // Compact summary
                    historyString,  // Compressed history
                    `${question}\n\nAI Ответ: ${aiAnswer}`
                ]];
                
                await this.sheetsClient.spreadsheets.values.update({
                    spreadsheetId: this.spreadsheetId,
                    range: updateRange,
                    valueInputOption: 'RAW',
                    requestBody: {
                        values: updateValues
                    }
                });
                
                log(`Контекст беседы обновлен для пользователя: ${userName}`, 'g');
                return true;
            }
            
            log(`Не найдено существующих записей для обновления для пользователя ${userName}`, 'c');
            return false; // No existing conversation found
        } catch (err) {
            log(`Ошибка при обновлении контекста беседы в Google Sheets: ${err}`, 'r');
            return false;
        }
    }
    
    // Get conversation context for a user from Google Sheets
    async getConversationContext(userName) {
        try {
            log(`Попытка получения контекста беседы из Google Sheets для пользователя: ${userName}`, 'c');
            
            // Validate context sheet name
            if (!this.contextSheetName || this.contextSheetName.trim() === '') {
                log(`Ошибка: Имя листа контекста не задано`, 'r');
                return null;
            }
            
            // Initialize sheets client if not already done
            if (!this.sheetsClient) {
                const initSuccess = await this.initSheetsClient();
                if (!initSuccess) {
                    return null;
                }
            }
            
            // Get all data from the context sheet
            const response = await this.sheetsClient.spreadsheets.values.get({
                spreadsheetId: this.spreadsheetId,
                range: `${this.contextSheetName}!A:E`
            });
            
            const rows = response.data.values;
            
            if (!rows || rows.length <= 1) { // Header row + at least one data row
                log(`Нет данных в листе контекста ${this.contextSheetName}`, 'c');
                return null;
            }
            
            log(`Получено ${rows.length} строк данных из листа контекста`, 'c');
            
            // Find the most recent conversation for this user
            let latestContext = null;
            let latestTimestamp = null;
            
            for (let i = 1; i < rows.length; i++) { // Start from 1 to skip header
                const row = rows[i];
                
                // Check if row has enough columns
                if (row.length >= 5) {
                    const rowUserName = row[0];
                    const timestamp = row[1];
                    const contextSummary = row[2];
                    const historyString = row[3];
                    const lastExchange = row[4];
                    
                    log(`Проверка строки ${i}: пользователь=${rowUserName}, время=${timestamp}`, 'c');
                    
                    // Check if this row is for the requested user
                    if (rowUserName === userName) {
                        log(`Найдена запись для пользователя ${userName} со временем ${timestamp}`, 'c');
                        // Check if this is the most recent conversation
                        if (!latestTimestamp || timestamp > latestTimestamp) {
                            latestTimestamp = timestamp;
                            latestContext = {
                                userName: rowUserName,
                                timestamp: timestamp,
                                contextSummary: contextSummary,
                                historyString: historyString,
                                lastExchange: lastExchange
                            };
                            log(`Обновлена последняя запись для пользователя ${userName}`, 'c');
                        }
                    }
                }
            }
            
            if (latestContext) {
                log(`Найден контекст беседы для пользователя ${userName}`, 'g');
                log(`Контекст: ${JSON.stringify(latestContext)}`, 'c');
            } else {
                log(`Контекст беседы для пользователя ${userName} не найден`, 'c');
            }
            
            return latestContext;
        } catch (err) {
            log(`Ошибка при получении контекста беседы из Google Sheets: ${err}`, 'r');
            return null;
        }
    }
    
    // Set context sheet name
    setContextSheetName(sheetName) {
        this.contextSheetName = sheetName;
    }
    
    // Set accounts sheet name
    setAccountsSheetName(sheetName) {
        this.accountsSheetName = sheetName;
    }
    
    // Initialize accounts sheet with headers
    async initializeAccountsSheet() {
        try {
            // Initialize sheets client if not already done
            if (!this.sheetsClient) {
                const initSuccess = await this.initSheetsClient();
                if (!initSuccess) {
                    return false;
                }
            }
            
            // Check if the sheet already exists by trying to read it
            try {
                const response = await this.sheetsClient.spreadsheets.values.get({
                    spreadsheetId: this.spreadsheetId,
                    range: `${this.accountsSheetName}!A1:E1`
                });
                
                // If we get here, the sheet exists. Check if it has headers
                const values = response.data.values;
                if (!values || values.length === 0 || values[0].length === 0) {
                    // Sheet exists but is empty, add headers
                    await this.addAccountsSheetHeaders();
                }
            } catch (error) {
                // Sheet doesn't exist, create it
                log(`Accounts sheet "${this.accountsSheetName}" not found, creating it`, 'c');
                await this.createAccountsSheet();
            }
            
            return true;
        } catch (err) {
            log(`Error initializing accounts sheet: ${err}`, 'r');
            return false;
        }
    }
    
    // Create accounts sheet with headers
    async createAccountsSheet() {
        try {
            // Create the sheet
            const response = await this.sheetsClient.spreadsheets.batchUpdate({
                spreadsheetId: this.spreadsheetId,
                resource: {
                    requests: [{
                        addSheet: {
                            properties: {
                                title: this.accountsSheetName
                            }
                        }
                    }]
                }
            });
            
            log(`Created accounts sheet "${this.accountsSheetName}"`, 'g');
            
            // Add headers
            await this.addAccountsSheetHeaders();
            
            return true;
        } catch (err) {
            // If sheet already exists, that's fine
            if (err.message.includes('already exists')) {
                log(`Accounts sheet "${this.accountsSheetName}" already exists`, 'c');
                await this.addAccountsSheetHeaders();
                return true;
            }
            
            log(`Error creating accounts sheet: ${err}`, 'r');
            return false;
        }
    }
    
    // Add headers to accounts sheet
    async addAccountsSheetHeaders() {
        try {
            const headers = [['Game', 'Account Parameters', 'Link', 'Status', 'Price']];
            
            await this.sheetsClient.spreadsheets.values.update({
                spreadsheetId: this.spreadsheetId,
                range: `${this.accountsSheetName}!A1:E1`,
                valueInputOption: 'RAW',
                requestBody: {
                    values: headers
                }
            });
            
            log(`Added headers to accounts sheet "${this.accountsSheetName}"`, 'g');
            return true;
        } catch (err) {
            log(`Error adding headers to accounts sheet: ${err}`, 'r');
            return false;
        }
    }
    
    // Sync accounts to Google Sheets
    async syncAccountsToSheet(accounts) {
        try {
            log(`Syncing ${accounts.length} accounts to Google Sheets`, 'c');
            
            // Initialize sheets client if not already done
            if (!this.sheetsClient) {
                const initSuccess = await this.initSheetsClient();
                if (!initSuccess) {
                    return false;
                }
            }
            
            // Initialize accounts sheet if needed
            await this.initializeAccountsSheet();
            
            // Clear existing data (but keep headers)
            try {
                await this.sheetsClient.spreadsheets.values.clear({
                    spreadsheetId: this.spreadsheetId,
                    range: `${this.accountsSheetName}!A2:E1000`
                });
            } catch (err) {
                log(`Warning: Could not clear existing data: ${err}`, 'y');
            }
            
            // Add account data
            if (accounts.length > 0) {
                const values = accounts.map(account => [
                    account.game || '',
                    account.parameters || '',
                    account.link || '',
                    account.status || 'In Stock',
                    account.price || ''  // Add price column
                ]);
                
                const response = await this.sheetsClient.spreadsheets.values.append({
                    spreadsheetId: this.spreadsheetId,
                    range: `${this.accountsSheetName}!A2:E`,
                    valueInputOption: 'RAW',
                    requestBody: {
                        values: values
                    }
                });
                
                log(`Successfully synced ${accounts.length} accounts to Google Sheets`, 'g');
            } else {
                log(`No accounts to sync`, 'c');
            }
            
            return true;
        } catch (err) {
            log(`Error syncing accounts to Google Sheets: ${err}`, 'r');
            return false;
        }
    }
    
    // Update account status in Google Sheets
    async updateAccountStatus(game, parameters, newStatus) {
        try {
            log(`Updating account status in Google Sheets: ${game}, ${parameters} -> ${newStatus}`, 'c');
            
            // Initialize sheets client if not already done
            if (!this.sheetsClient) {
                const initSuccess = await this.initSheetsClient();
                if (!initSuccess) {
                    return false;
                }
            }
            
            // Get all data from the accounts sheet
            const response = await this.sheetsClient.spreadsheets.values.get({
                spreadsheetId: this.spreadsheetId,
                range: `${this.accountsSheetName}!A:E`
            });
            
            const rows = response.data.values;
            
            if (!rows || rows.length <= 1) {
                log(`No data found in accounts sheet`, 'c');
                return false;
            }
            
            // Find the account row
            let rowIndex = -1;
            for (let i = 1; i < rows.length; i++) { // Start from 1 to skip headers
                const row = rows[i];
                if (row.length >= 2 && row[0] === game && row[1] === parameters) {
                    rowIndex = i + 1; // Google Sheets is 1-indexed
                    break;
                }
            }
            
            if (rowIndex === -1) {
                log(`Account not found in sheet: ${game}, ${parameters}`, 'c');
                return false;
            }
            
            // Update the status in column D (index 3)
            const updateRange = `${this.accountsSheetName}!D${rowIndex}`;
            const updateValues = [[newStatus]];
            
            await this.sheetsClient.spreadsheets.values.update({
                spreadsheetId: this.spreadsheetId,
                range: updateRange,
                valueInputOption: 'RAW',
                requestBody: {
                    values: updateValues
                }
            });
            
            log(`Successfully updated account status to "${newStatus}"`, 'g');
            return true;
        } catch (err) {
            log(`Error updating account status: ${err}`, 'r');
            return false;
        }
    }
    
    // Get accounts data from Google Sheets
    async getAccountsData() {
        try {
            log(`Attempting to retrieve accounts data from Google Sheets`, 'c');
            log(`Spreadsheet ID: ${this.spreadsheetId}`, 'c');
            log(`Accounts sheet name: ${this.accountsSheetName}`, 'c');
            
            // Initialize sheets client if not already done
            if (!this.sheetsClient) {
                const initSuccess = await this.initSheetsClient();
                if (!initSuccess) {
                    log(`Failed to initialize Google Sheets client`, 'r');
                    return [];
                }
            }
            
            // Get all data from the accounts sheet
            const response = await this.sheetsClient.spreadsheets.values.get({
                spreadsheetId: this.spreadsheetId,
                range: `${this.accountsSheetName}!A:E`
            });
            
            log(`Google Sheets API response received`, 'c');
            log(`Response data: ${response.data ? 'PRESENT' : 'MISSING'}`, 'c');
            
            const rows = response.data.values;
            log(`Number of rows retrieved: ${rows ? rows.length : 0}`, 'c');
            
            if (!rows || rows.length <= 1) {
                log(`No data found in accounts sheet or only headers present`, 'c');
                return [];
            }
            
            // Convert rows to array of objects
            const headers = rows[0];
            log(`Headers: ${JSON.stringify(headers)}`, 'c');
            const accounts = [];
            
            for (let i = 1; i < rows.length; i++) {
                const row = rows[i];
                log(`Processing row ${i}: ${JSON.stringify(row)}`, 'c');
                const account = {};
                
                for (let j = 0; j < headers.length && j < row.length; j++) {
                    account[headers[j]] = row[j];
                }
                
                log(`Processed account: ${JSON.stringify(account)}`, 'c');
                accounts.push(account);
            }
            
            log(`Successfully retrieved ${accounts.length} accounts from Google Sheets`, 'g');
            return accounts;
        } catch (err) {
            log(`Error retrieving accounts data: ${err}`, 'r');
            log(`Error details: ${JSON.stringify(err)}`, 'r');
            return [];
        }
    }
    
    // Chunk a long message into smaller parts to avoid FunPay's message length limits
    chunkLongMessage(message) {
        // Maximum safe message length (leaving some buffer for safety)
        const maxLength = 750; // Reduced to 750 per memory constraints
        
        // If message is already short enough, return as single-item array
        if (message.length <= maxLength) {
            return [message];
        }
        
        // For account listings, try to split at logical boundaries (per account entry)
        if (message.includes('аккаунт') || message.includes('account') || message.includes('Arena Breakout')) {
            return this.chunkAccountMessage(message, maxLength);
        }
        
        // Split message into chunks
        const chunks = [];
        let currentChunk = '';
        
        // Split by lines to preserve formatting
        const lines = message.split('\n');
        
        for (const line of lines) {
            // If adding this line would exceed the limit, save current chunk and start new one
            if (currentChunk.length + line.length + 1 > maxLength && currentChunk.length > 0) {
                chunks.push(currentChunk.trim());
                currentChunk = '';
            }
            
            // If line itself is too long, split it
            if (line.length > maxLength) {
                // Add current chunk if it exists
                if (currentChunk.length > 0) {
                    chunks.push(currentChunk.trim());
                    currentChunk = '';
                }
                
                // Split long line into smaller parts
                let remainingLine = line;
                while (remainingLine.length > maxLength) {
                    chunks.push(remainingLine.substring(0, maxLength));
                    remainingLine = remainingLine.substring(maxLength);
                }
                
                // Add any remaining part
                if (remainingLine.length > 0) {
                    currentChunk = remainingLine;
                }
            } else {
                // Add line to current chunk
                if (currentChunk.length > 0) {
                    currentChunk += '\n' + line;
                } else {
                    currentChunk = line;
                }
            }
        }
        
        // Add final chunk if it exists
        if (currentChunk.length > 0) {
            chunks.push(currentChunk.trim());
        }
        
        // Return chunks without any continuation indicators
        return chunks;
    }
    
    // Special chunking for account listings to ensure proper splitting
    chunkAccountMessage(message, maxLength) {
        const chunks = [];
        let currentChunk = '';
        
        // Split by lines
        const lines = message.split('\n');
        let accountCount = 0;
        
        for (const line of lines) {
            // Check if this line starts a new account entry
            if (line.match(/^\d+\./) || line.includes('Ссылка:')) {
                accountCount++;
                
                // If we've reached 2 accounts and adding this line would exceed limit, start new chunk
                if (accountCount > 2 && currentChunk.length + line.length + 1 > maxLength && currentChunk.length > 0) {
                    chunks.push(currentChunk.trim());
                    currentChunk = '';
                    accountCount = 1; // Reset counter for new chunk, but count this account
                }
            }
            
            // Add line to current chunk
            if (currentChunk.length > 0) {
                currentChunk += '\n' + line;
            } else {
                currentChunk = line;
            }
        }
        
        // Add final chunk if it exists
        if (currentChunk.length > 0) {
            chunks.push(currentChunk.trim());
        }
        
        // Return chunks without any continuation indicators
        return chunks;
    }
}

export default GoogleSheetsFAQ;