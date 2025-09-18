// MODULES
const c = global.chalk;
const clone = global.clone;
const fetch = global.fetch;
const log = global.log;
const parseDOM = global.DOMParser;
const { load, updateFile, getConst } = global.storage;

// CONSTANTS
const goodsfilePath = 'data/configs/delivery.json';
const settings = global.settings;
let goods = []; // Initialize as empty array
let backupOrders = [];

// Flag to prevent concurrent execution of checkForNewOrders
let isCheckingOrders = false;

// Log the current state of backupOrders for debugging
log(`Инициализация модуля sales.js, backupOrders.length: ${backupOrders.length}`, 'c');

// Store for scheduled follow-up messages
const followUpMessages = new Map();

// Function to enable auto-issue functionality
function enableAutoIssue() {
    log(`Автовыдача запущена.`, 'g');
    // Initialize backupOrders with current orders to establish baseline
    getOrders().then(orders => {
        backupOrders = clone(orders);
        log(`Инициализирован backupOrders с ${backupOrders.length} заказами`, 'c');
        if (backupOrders.length > 0) {
            log(`Первый заказ в backupOrders: ${backupOrders[0].id}, статус: ${backupOrders[0].status}`, 'c');
        }
    }).catch(err => {
        log(`Ошибка при инициализации backupOrders: ${err}`, 'r');
    });
}

// Function to clear all scheduled follow-up messages
function clearFollowUpMessages() {
    for(const [orderId, scheduledMessage] of followUpMessages.entries()) {
        clearTimeout(scheduledMessage.timeoutId);
    }
    followUpMessages.clear();
    log('Все запланированные follow-up сообщения отменены', 'c');
}

// Function to send follow-up message
async function sendFollowUpMessage(order) {
    try {
        log(`sendFollowUpMessage вызван для заказа: ${JSON.stringify(order)}`, 'c');
        
        // Check if follow-up messages are enabled
        if (!settings.followUpMessage) {
            log(`Follow-up сообщения отключены в настройках`, 'c');
            return false;
        }
        
        // Use customizable message text from settings, with fallback to default
        let message = settings.followUpMessageText || 'Спасибо за покупку!🌟\nПосле всех проверок зайдите пожалуйста в покупки и нажмите "подтвердить заказ" по ссылке https://funpay.com/orders/{order_id}/';
        
        // Replace the order ID placeholder
        message = message.replace('{order_id}', order.id.replace('#', ''));
        
        // Replace \n with actual newline character
        message = message.replace(/\\n/g, '\n');
        
        // Properly escape quotes and other special characters for JSON
        message = message.replace(/"/g, '\\"');
        
        log(`Текст сообщения: ${message}`, 'c');
        
        // Use true for customNode to properly format the node
        const result = await global.chat.sendMessage(order.buyerId, message, true, 'auto');
        
        log(`Результат отправки сообщения: ${JSON.stringify(result)}`, 'c');
        
        if(result) {
            log(`Отправлено follow-up сообщение покупателю ${c.yellowBright(order.buyerName)} по заказу ${c.yellowBright(order.id)}`);
            
            // Remove from scheduled messages
            followUpMessages.delete(order.id);
            return true;
        } else {
            log(`Не удалось отправить follow-up сообщение покупателю ${order.buyerName} по заказу ${order.id}`, 'r');
            return false;
        }
    } catch (err) {
        log(`Ошибка при отправке follow-up сообщения: ${err}`, 'r');
        return false;
    }
}

async function checkForNewOrders() {
    // Prevent concurrent execution
    if (isCheckingOrders) {
        log(`Проверка заказов уже выполняется, пропускаем вызов`, 'c');
        return;
    }
    
    isCheckingOrders = true;
    
    try {
        log(`Начало проверки новых заказов, backupOrders.length: ${backupOrders.length}`, 'c');
        if (backupOrders.length > 0) {
            log(`Первый заказ в backupOrders: ${backupOrders[0].id}, статус: ${backupOrders[0].status}`, 'c');
        }
        
        // Load goods data
        goods = await load(goodsfilePath);
        
        let orders = [];

        log(`Проверяем на наличие новых заказов...`, 'c');
        orders = await getNewOrders(backupOrders);
        
        log(`Результат проверки заказов: newOrders.length: ${orders.newOrders.length}, backupOrders.length: ${orders.backupOrders.length}`, 'c');
        if (orders.backupOrders.length > 0) {
            log(`Первый заказ в результатах: ${orders.backupOrders[0].id}, статус: ${orders.backupOrders[0].status}`, 'c');
        }

        if(!orders || orders.newOrders.length == 0) {
            log(`Новых заказов нет.`, 'c');
            isCheckingOrders = false;
            return;
        }

        for(let i = 0; i < orders.newOrders.length; i++) {
            const order = orders.newOrders[i];

            if(!order) {
                log('!order', 'c');
                isCheckingOrders = false;
                return;
            }

            log(`Обнаружен новый заказ ${c.yellowBright(order.id)} от покупателя ${c.yellowBright(order.buyerName)} на сумму ${c.yellowBright(order.price)} ₽.`, 'g');
            
            // Always send Telegram notification immediately when a new order is detected
            if(global.telegramBot && settings.newOrderNotification) {
                try {
                    const notificationResult = await global.telegramBot.sendNewOrderNotification(order);
                    if (notificationResult) {
                        log(`Уведомление о новом заказе ${c.yellowBright(order.id)} отправлено в Telegram`, 'g');
                    } else {
                        log(`Не удалось отправить уведомление о новом заказе ${c.yellowBright(order.id)} в Telegram`, 'r');
                    }
                } catch (error) {
                    log(`Ошибка при отправке уведомления в Telegram: ${error}`, 'r');
                }
            } else if (global.telegramBot) {
                log(`Telegram бот инициализирован, но уведомления о заказах отключены в настройках`, 'c');
            } else {
                log(`Telegram бот не инициализирован`, 'c');
            }
    
            log(`Новый заказ ${c.yellowBright(order.id)} от покупателя ${c.yellowBright(order.buyerName)} на сумму ${c.yellowBright(order.price)} ₽.`);

            // Schedule follow-up message for 5 minutes later (as requested)
            if(settings.followUpMessage) {
                log(`Запланировано follow-up сообщение для заказа ${c.yellowBright(order.id)} через 5 минут`, 'c');
                
                // Schedule for 5 minutes later
                const timeoutId = setTimeout(() => {
                    sendFollowUpMessage(order);
                }, 300000); // 5 minutes (300000 ms)
                
                // Store the timeout ID so we can cancel if needed
                followUpMessages.set(order.id, {
                    timeoutId: timeoutId,
                    order: order
                });
            } else {
                log(`Follow-up сообщения отключены в настройках`, 'c');
            }

            for(let j = 0; j < order.count; j++) {
                await issueGood(order.buyerId, order.buyerName, order.name, 'id');
            }
        }
        
        backupOrders = clone(orders.backupOrders);
        log(`backupOrders обновлен, новый размер: ${backupOrders.length}`, 'c');
        if (backupOrders.length > 0) {
            log(`Первый заказ в обновленном backupOrders: ${backupOrders[0].id}, статус: ${backupOrders[0].status}`, 'c');
        }
    } catch (err) {
        log(`Ошибка при автовыдаче: ${err}`, 'r');
    } finally {
        // Always reset the flag when done
        isCheckingOrders = false;
    }
}

async function issueGood(buyerIdOrNode, buyerName, goodName, type = 'id') {
    let result = false;

    try {
        goods = await load(goodsfilePath);
        let message = "";
        
        for(let i = 0; i < goods.length; i++) {
            if(goodName.includes(goods[i].name)) {
                if(goods[i].message != undefined) {
                    message = goods[i].message;
                    break;
                } 
                else
                if(goods[i].nodes != undefined) {
                    let notInStock = true;

                    for(let j = 0; j < goods[i].nodes.length; j++) {
                        const node = goods[i].nodes[j];
    
                        goods[i].nodes.shift();
                        await updateFile(goods, goodsfilePath);
                        message = node;
                        notInStock = false;
                        break;
                    }

                    if(notInStock) {
                        log(`Похоже, товар "${goodName}" закончился, выдавать нечего.`);
                        return 'notInStock';
                    }
                }
            }
        }

        if(message != "") {
            let node = buyerIdOrNode;
            let customNode = false;

            if(type == 'id') {
                customNode = true;
            }
            
            result = await global.chat.sendMessage(node, message, customNode, 'auto');
            
            if(result) {
                log(`Товар "${c.yellowBright(goodName)}" выдан покупателю ${c.yellowBright(buyerName)} с сообщением:`);
                log(message);

                if(global.telegramBot && settings.deliveryNotification) {
                    global.telegramBot.sendDeliveryNotification(buyerName, goodName, message, node);
                }
                
                // Update account status in Google Sheets if the feature is enabled
                if (global.googleSheetsFAQ && global.settings.googleSheetsAccountsSheetName) {
                    try {
                        // Extract game and parameters from the good name
                        // Try to parse structured descriptions like "Game - Parameters" or "Game, Parameters"
                        let game = goodName;
                        let parameters = goodName;
                        
                        // Try to extract game name from description
                        const separators = [' - ', ' – ', ', ', ': '];
                        for (const separator of separators) {
                            if (goodName.includes(separator)) {
                                const parts = goodName.split(separator);
                                if (parts.length >= 2) {
                                    game = parts[0].trim();
                                    parameters = goodName; // Keep full name as parameters
                                    break;
                                }
                            }
                        }
                        
                        log(`Updating account status in Google Sheets for: ${game}, ${parameters}`, 'c');
                        await global.googleSheetsFAQ.updateAccountStatus(game, parameters, 'Sold');
                    } catch (err) {
                        log(`Error updating account status in Google Sheets: ${err}`, 'r');
                    }
                }

            } else {
                log(`Не удалось отправить товар "${goodName}" покупателю ${buyerName}.`, 'r');
            }
        } else {
            log(`Товара "${c.yellowBright(goodName)}" нет в списке автовыдачи, пропускаю.`, 'y');
        }
    } catch (err) {
        log(`Ошибка при выдаче товара: ${err}`, 'r');
    }

    return result;
}

async function getGood(orderName) {
    let result = false;
    try {
        goods = await load(goodsfilePath);
    
        for(let i = 0; i < goods.length; i++) {
            if(orderName == goods[i].name) {
                result = goods[i];
                break;
            }
        }
    } catch (err) {
        log(`Ошибка при поиске заказов по нику: ${err}`, 'r');
    }

    return result;
}

async function addDeliveredName(orderName, name, orderId) {
    try {
        goods = await load(goodsfilePath);
        
        for(let i = 0; i < goods.length; i++) {
            if(orderName === goods[i].name) {
                if(goods[i].delivered == undefined) {
                    goods[i].delivered = [];
                }

                goods[i].delivered.push({
                    name: name, order: orderId
                });
                await updateFile(goods, goodsfilePath);
                break;
            }
        }
    } catch (err) {
        log(`Ошибка при записи новых ников к заказу: ${err}`, 'r');
    }
}

async function searchOrdersByUserName(userName) {
    let result = [];
    try {
        goods = await load(goodsfilePath);
    
        const orders = await getOrders();
    
        for(let i = 0; i < orders.length; i++) {
            if (orders[i].buyerName == userName) {
                result[result.length] = orders[i];
            }
        }
    } catch (err) {
        log(`Ошибка при поиске заказов по нику: ${err}`, 'r');
    }

    return result;
}

async function getNewOrders(lastOrders) {
    log(`getNewOrders вызван с lastOrders.length: ${lastOrders ? lastOrders.length : 0}`, 'c');
    if (lastOrders && lastOrders.length > 0) {
        log(`Первый заказ в lastOrders: ${lastOrders[0].id}, статус: ${lastOrders[0].status}`, 'c');
    }
    
    // If this is the first run (no previous orders), get current orders and use them as baseline
    if(!lastOrders || !lastOrders[0]) {
        log(`Начальные данные по заказам не переданы, получаем текущие заказы как базовый список`);
        try {
            const orders = await getOrders();
            if(!orders || !orders[0]) {
                log(`Ошибка получения новых заказов: список заказов пуст.`, 'r');
                return {newOrders: [], backupOrders: []};
            }
            // On first run, we don't have any "new" orders, just a baseline
            log(`Получено ${orders.length} заказов как базовый список`);
            if (orders.length > 0) {
                log(`Первый заказ в полученных данных: ${orders[0].id}, статус: ${orders[0].status}`, 'c');
            }
            return {newOrders: [], backupOrders: orders};
        } catch(err) {
            log(`Ошибка при получении начальных заказов: ${err}`, 'r');
            return {newOrders: [], backupOrders: []};
        }
    }

    let result = [];
    let orders = [];

    try {
        orders = await getOrders();
        if(!orders || !orders[0]) {
            log(`Ошибка получения новых заказов: список заказов пуст.`, 'r');
            return {newOrders: [], backupOrders: []};
        }

        log(`Сравнение ${orders.length} текущих заказов с ${lastOrders.length} предыдущими заказами`, 'c');
        if (orders.length > 0) {
            log(`Первый текущий заказ: ${orders[0].id}, статус: ${orders[0].status}`, 'c');
        }

        // Check for completely new orders (orders with IDs not seen before)
        for(let i = 0; i < orders.length; i++) {
            if(result.length >= 3) break;
            let contains = false;

            for(let j = 0; j < lastOrders.length; j++) {
                if(orders[i].id == lastOrders[j].id) {
                    contains = true;
                    break;
                }
            }

            if(contains == false) {
                result.push(Object.assign(orders[i]));
                log(`Найден новый заказ: ${orders[i].id} со статусом ${orders[i].status}`, 'c');
            }
        }
        
        // Also check for status changes in existing orders that might be relevant
        for(let i = 0; i < orders.length; i++) {
            for(let j = 0; j < lastOrders.length; j++) {
                if(orders[i].id == lastOrders[j].id) {
                    // If order status changed in a way that might be significant, treat as new
                    // Specifically, look for orders that became "Оплачен" (regardless of previous status)
                    if(orders[i].status == "Оплачен" && lastOrders[j].status != "Оплачен") {
                        // Check if we've already added this order to result
                        let alreadyAdded = false;
                        for(let k = 0; k < result.length; k++) {
                            if(result[k].id == orders[i].id) {
                                alreadyAdded = true;
                                break;
                            }
                        }
                        
                        if(!alreadyAdded) {
                            result.push(Object.assign(orders[i]));
                            log(`Обнаружено изменение статуса заказа ${orders[i].id} на "Оплачен"`, 'c');
                        }
                    }
                    break;
                }
            }
        }
        
        // Additionally, check if any "Оплачен" orders in the current fetch were not in the previous fetch
        // This handles the case where an order was already "Оплачен" when first detected
        for(let i = 0; i < orders.length; i++) {
            if(orders[i].status == "Оплачен") {
                let wasInPrevious = false;
                for(let j = 0; j < lastOrders.length; j++) {
                    if(orders[i].id == lastOrders[j].id) {
                        wasInPrevious = true;
                        break;
                    }
                }
                
                // If this "Оплачен" order wasn't in the previous fetch at all, treat as significant
                if(!wasInPrevious) {
                    // Check if we've already added this order to result
                    let alreadyAdded = false;
                    for(let k = 0; k < result.length; k++) {
                        if(result[k].id == orders[i].id) {
                            alreadyAdded = true;
                            break;
                        }
                    }
                    
                    if(!alreadyAdded) {
                        result.push(Object.assign(orders[i]));
                        log(`Обнаружен новый заказ ${orders[i].id} со статусом "Оплачен"`, 'c');
                    }
                }
            }
        }
        
        log(`Всего новых заказов найдено: ${result.length}`, 'c');
        if (result.length > 0) {
            for(let i = 0; i < result.length; i++) {
                log(`Новый заказ ${i+1}: ${result[i].id}, статус: ${result[i].status}`, 'c');
            }
        }
        
        if (orders.length > 0) {
            log(`Первый заказ в возвращаемых данных: ${orders[0].id}, статус: ${orders[0].status}`, 'c');
        }
    } catch(err) {
        log(`Ошибка при получении новых заказов: ${err}`, 'r');
        return {newOrders: [], backupOrders: lastOrders}; // Keep previous orders on error
    }

    return {newOrders: result, backupOrders: orders};
}

async function getOrders() {
    let result = [];
    try {
        const url = `${getConst('api')}/orders/trade`;
        const headers = {
            "cookie": `golden_key=${settings.golden_key}`,
            "x-requested-with": "XMLHttpRequest"
        };

        const options = {
            method: 'POST',
            headers: headers
        }

        let resp = await fetch(url, options);
        
        const data = await resp.text();
        const doc = parseDOM(data);
        const ordersEl = doc.querySelectorAll(".tc-item");

        for(let i = 0; i < ordersEl.length; i++) {
            const order = ordersEl[i];
            const id = order.querySelector(".tc-order").innerHTML;
            const name = order.querySelector(".order-desc").querySelector('div').innerHTML;
            const buyerName = order.querySelector(".media-user-name > span").innerHTML;
            const buyerProfileLink = order.querySelector(".avatar-photo").getAttribute("data-href").split("/");
            const buyerId = buyerProfileLink[buyerProfileLink.length - 2];
            const status = order.querySelector(".tc-status").innerHTML;
            const price = Number(order.querySelector(".tc-price").firstChild.textContent);
            const unit = order.querySelector(".tc-price").querySelector("span").innerHTML;

            const sections = name.split(',');
            let count = 1;
            
            if(sections.length > 1) {
                const section = sections[sections.length - 1];
                if(section.includes('шт.')) {
                    count = Number(section.split('шт.')[0]);

                    if(!count || isNaN(count)) {
                        count = 1;
                    }
                }
            }

            result.push({
                id: id,
                name: name,
                buyerId: buyerId,
                buyerName: buyerName,
                status: status,
                price: price,
                unit: unit,
                count: count
            });
        }

        return result;
    } catch (err) {
        log(`Ошибка при получении списка продаж: ${err}`, 'r');
    }
    return result;
}

async function getLotNames() {
    let result = [];
    try {
        const url = `${getConst('api')}/users/${global.appData.id}/`;
        const headers = {
            "cookie": `golden_key=${settings.golden_key}`
        };

        const options = {
            method: 'GET',
            headers: headers
        };

        let resp = await fetch(url, options);
        const data = await resp.text();
        const doc = parseDOM(data);
        const lotNamesEl = doc.querySelectorAll(".tc-desc-text");

        for(let i = 0; i < lotNamesEl.length; i++) {
            result.push(lotNamesEl[i].innerHTML);
        }

        return result;
    } catch (err) {
        log(`Ошибка при получении списка лотов: ${err}`, 'r');
    }
}

export { getOrders, getNewOrders, issueGood, getLotNames, searchOrdersByUserName, checkForNewOrders, getGood, addDeliveredName, enableAutoIssue, clearFollowUpMessages, sendFollowUpMessage };