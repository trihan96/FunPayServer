// MODULES
const fetch = global.fetch;
const { headers } = global.account;
const parseDOM = global.DOMParser;
const { updateCategoriesData } = global.categories;
const { load, updateFile, getConst } = global.storage;
const log = global.log;

// FUNCTIONS
async function updateGoodsState() {
    log(`Обновляем список состояния товаров...`, 'c');
    const data = await getActiveProducts(global.appData.id);

    await updateFile(data, `data/other/goodsState.json`);
    log(`Список состояния товаров обновлён.`, 'g');
}

/*function backupGoods(userId) {
    log(`Бэкапим товары...`);
    const goods = getAllGoods(userId, true);
    const data = { goods: goods };

    await updateFile(data, `data/goodsBackup.js`);
    log(`Бэкап создан.`);
}*/

async function getAllGoods(userId, full = false) {
    let result = [];
    try {
        let cat = await load('data/other/categories.json');

        if(!cat || cat.length == 0) {
            cat = await updateCategoriesData();
        }
        
        for(let i = 0; i < cat.length; i++) {
            let link = '';

            if(typeof cat[i] == 'object') {
                link = `${getConst('api')}/lots/${cat[i].node_id}/trade`;
            } else {
                link = cat[i];
            }
            
            const goods = await getGoodsFromCategory(link, full);
            goods.forEach(good => {
                result[result.length] = good;
            });
        }
    } catch(err) {
        log(`Ошибка при получении товаров: ${err}`, 'r');
    }
    return result;
}

async function getGoodsFromCategory(category, full = false) {
    let result = [];
    try {
        const options = {
            method: 'GET',
            headers: headers
        };

        const resp = await fetch(category, options);
        const body = await resp.text();

        const doc = parseDOM(body);
        const goodsEl = doc.querySelectorAll(".tc-item");
        for(let i = 0; i < goodsEl.length; i++) {
            let goodEl = goodsEl[i];
            let good = {};
            let active = false;

            if(!goodEl.classList.contains("warning")) {
                active = true;
            }

            if(full) {
                try {
                    good = {
                        node_id: goodEl.getAttribute('data-node'),
                        offer_id: goodEl.getAttribute('data-offer'),
                        server: goodEl.querySelector(".tc-server") ? goodEl.querySelector(".tc-server").innerHTML : '',
                        description: goodEl.querySelector(".tc-desc .tc-desc-text") ? goodEl.querySelector(".tc-desc .tc-desc-text").innerHTML : '',
                        price: goodEl.querySelector(".tc-price") ? goodEl.querySelector(".tc-price").getAttribute('data-s') : '',
                        unit: goodEl.querySelector(".tc-price .unit") ? goodEl.querySelector(".tc-price .unit").innerHTML : '',
                        active: active
                    };
                } catch (err) {
                    log(`Error processing good ${i} with offer_id ${goodEl.getAttribute('data-offer')}: ${err}`, 'r');
                    // Continue with basic info if full info fails
                    good = {
                        node_id: goodEl.getAttribute('data-node'),
                        offer_id: goodEl.getAttribute('data-offer'),
                        active: active
                    };
                }
            } else {
                good = {
                    node_id: goodEl.getAttribute('data-node'),
                    offer_id: goodEl.getAttribute('data-offer'),
                    active: active
                };
            }
            result[i] = good;
        }
    } catch(err) {
        log(`Ошибка при получении товаров из категории: ${err}`, 'r');
        log(`Stack: ${err.stack}`, 'r');
    }
    return result;
}

async function getActiveProducts(id) {
    let result = [];

    try {
        const link = `${getConst('api')}/users/${id}/`;

        const resp = await fetch(link);
        const body = await resp.text();
        const doc = parseDOM(body);

        const mb20 = doc.querySelector('.mb20');
        if(!mb20) return [];
        const offers = mb20.querySelectorAll('.offer');

        for(let i = 0; i < offers.length; i++) {
            const offer = offers[i];
            const title = offer.querySelector('.offer-list-title a');
            const link = title.getAttribute('href');
            if(link.includes('chips')) continue;
            const node = link.split('/')[4];

            const lots = offer.querySelectorAll('div[data-section-type="lot"] a');
            for(let j = 0; j < lots.length; j++) {
                const lot = lots[j];
                const offerId = lot.getAttribute('href').split('id=')[1];

                result.push({
                    node_id: node,
                    offer_id: offerId
                });
            }
        }
    } catch(err) {
        log(`Ошибка при получении товаров: ${err}`, 'r');
    }

    return result;
}

// Function to get all lots with full details for Google Sheets sync
async function getAllLotsForSync() {
    let result = [];
    try {
        log(`Getting all lots for Google Sheets sync`, 'c');
        
        // Get all goods with full details
        const allGoods = await getAllGoods(global.appData.id, true);
        
        // Process each good to extract relevant information
        for (let i = 0; i < allGoods.length; i++) {
            const good = allGoods[i];
            
            // Skip inactive goods
            if (!good.active) continue;
            
            // Extract game and parameters from description
            let game = 'Unknown Game';
            let parameters = good.description || 'No description';
            
            // Try to extract game name and parameters from description
            if (good.description) {
                // Remove HTML tags
                const cleanDesc = good.description.replace(/<[^>]*>/g, '').trim();
                
                // Based on our analysis, the game name is at the end after a comma
                // Format: "Description, Game Name, Status"
                const parts = cleanDesc.split(',').map(part => part.trim());
                
                if (parts.length >= 2) {
                    // The last part is the status (Продажа)
                    // The second to last part is the game name
                    game = parts[parts.length - 2] || 'Unknown Game';
                    
                    // Everything except the game name and status is the parameters
                    if (parts.length >= 3) {
                        parameters = parts.slice(0, parts.length - 2).join(', ');
                    } else {
                        parameters = 'No description';
                    }
                } else {
                    // Fallback to original method
                    parameters = cleanDesc;
                    
                    // Try to parse structured descriptions like "Game - Parameters" or "Game, Parameters"
                    const separators = [' - ', ' – ', ': '];
                    let parsed = false;
                    
                    for (const separator of separators) {
                        if (cleanDesc.includes(separator)) {
                            const parts = cleanDesc.split(separator);
                            if (parts.length >= 2) {
                                game = parts[0].trim();
                                parameters = cleanDesc; // Keep full description as parameters
                                parsed = true;
                                break;
                            }
                        }
                    }
                    
                    // If no separator found, try to extract game from beginning
                    if (!parsed) {
                        // Simple heuristic: first word or phrase before first comma/dash
                        const parts = cleanDesc.split(/[-,]/);
                        if (parts.length > 0) {
                            game = parts[0].trim();
                        }
                        parameters = cleanDesc;
                    }
                }
            }
            
            // Create full FunPay link
            const link = `https://funpay.com/lots/offer?id=${good.offer_id}`;
            
            // Calculate price with 14.1% commission
            let priceWithCommission = '';
            if (good.price) {
                const price = parseFloat(good.price);
                if (!isNaN(price)) {
                    // Add 14.1% commission
                    priceWithCommission = (price * 1.141).toFixed(2);
                }
            }
            
            result.push({
                game: game,
                parameters: parameters,
                link: link,
                status: 'In Stock',
                price: priceWithCommission  // Add price with commission
            });
        }
        
        log(`Prepared ${result.length} lots for Google Sheets sync`, 'g');
        return result;
    } catch(err) {
        log(`Ошибка при получении лотов для синхронизации: ${err}`, 'r');
        return [];
    }
}

export { getGoodsFromCategory, getAllGoods, getActiveProducts, updateGoodsState, getAllLotsForSync };
