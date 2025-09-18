// MODULES
const fetch = global.node_fetch;
const proxy = global.https_proxy_agent;
const { exit, sleep } = global.helpers;
const log = global.log;

// CONSTANTS
const settings = global.settings;
let retriesErrCounter = 0;

// PROXY
if(settings.proxy.useProxy == true) {
    if(!settings.proxy.type || !settings.proxy.host) {
        log(`Неверные данные прокси!`, 'r');
        log(`Тип прокси: ${settings.proxy.type || 'не задан'}`, 'r');
        log(`Хост прокси: ${settings.proxy.host || 'не задан'}`, 'r');
        await exit();
    }

    log(`Для обработки запросов используется ${settings.proxy.type} прокси: ${settings.proxy.host}:${settings.proxy.port || 80}`, 'g');
    
    // Test proxy configuration
    let proxyString = '';
    if(settings.proxy.login || settings.proxy.pass) {
        proxyString = `${settings.proxy.type}://${settings.proxy.login}:${settings.proxy.pass}@${settings.proxy.host}:${settings.proxy.port || 80}`;
    } else {
        proxyString = `${settings.proxy.type}://${settings.proxy.host}:${settings.proxy.port || 80}`;
    }
    
    log(`Строка подключения прокси: ${proxyString}`, 'c');
}

// FETCH FUNCTION
export default async function fetch_(url, options, delay = 0, retries = 20) {
    try {
        let tries = 1;
        if(retriesErrCounter > 5) {
            log(`Превышен максимальный лимит безуспешных попыток запросов!`, 'r');
            await exit();
        }

        // Adding user-agent
        if(!options) options = {};
        if(!options.headers) options.headers = {};
        if(!options.headers['User-Agent']) options.headers['User-Agent'] = settings.userAgent;

        // Adding proxy
        if(settings.proxy.useProxy == true) {
            let proxyString = '';

            if(settings.proxy.login || settings.proxy.pass) {
                proxyString = `${settings.proxy.type}://${settings.proxy.login}:${settings.proxy.pass}@${settings.proxy.host}:${settings.proxy.port}`;
            } else {
                proxyString = `${settings.proxy.type}://${settings.proxy.host}:${settings.proxy.port}`;
            }
            
            const agent = new proxy(proxyString);
            options.agent = agent;
        }

        // Adding delay
        await sleep(delay);

        // Making request
        let res = await fetch(url, options);

        // Retrying if necessary
        while(!res.ok) {
            if(tries > retries) {
                retriesErrCounter++;
                log(`Превышено количество попыток запроса.`, 'r');
                log(`URL: ${url}`, 'r');
                log(`Status: ${res.status} ${res.statusText}`, 'r');
                
                // If using proxy, suggest checking proxy settings
                if(settings.proxy.useProxy == true) {
                    log(`Используется прокси: ${settings.proxy.host}:${settings.proxy.port}`, 'r');
                    log(`Возможные причины:`, 'r');
                    log(`  1. Прокси сервер недоступен`, 'r');
                    log(`  2. Прокси требует аутентификацию`, 'r');
                    log(`  3. Прокси блокирует запросы к FunPay`, 'r');
                    log(`  4. Неправильные настройки прокси`, 'r');
                }
                
                log(`Request:`, 'r');
                log(options, 'r');
                log(`Response:`, 'r');
                log(res, 'r');
                break;
            };
            await sleep(2000);
            res = await fetch(url, options);
            tries++;
        }

        retriesErrCounter = 0;
        return res;
    } catch (err) {
        log(`Ошибка при запросе: ${err}`, 'r');
        
        // If using proxy, provide specific proxy-related error information
        if(settings.proxy.useProxy == true) {
            log(`Используется прокси: ${settings.proxy.host}:${settings.proxy.port}`, 'r');
            log(`Проверьте доступность прокси сервера и его настройки`, 'r');
        }
        
        //return await fetch_(url, options, delay + 200, retries - 5);
    }
}
