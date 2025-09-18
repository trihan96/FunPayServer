# SOCKS5 Proxy Setup for Gemini API

This guide explains how to configure SOCKS5 proxy for Gemini API requests in the FunPayServer.

## Configuration

To enable SOCKS5 proxy for Gemini API requests, you need to modify the `settings.txt` file in the root directory of the project.

### Settings Configuration

Add or modify the following settings in the `[FunPay]` section of your `settings.txt` file:

```ini
# Включить SOCKS5 прокси для Gemini API. [1 - включить, 0 - выключить]
geminiSocks5ProxyEnabled: 1

# Хост SOCKS5 прокси для Gemini API
geminiSocks5ProxyHost: 127.0.0.1

# Порт SOCKS5 прокси для Gemini API
geminiSocks5ProxyPort: 1080
```

### Example Configuration

```ini
[FunPay]
# ... other settings ...

# Включить SOCKS5 прокси для Gemini API. [1 - включить, 0 - выключить]
geminiSocks5ProxyEnabled: 1

# Хост SOCKS5 прокси для Gemini API
geminiSocks5ProxyHost: 127.0.0.1

# Порт SOCKS5 прокси для Gemini API
geminiSocks5ProxyPort: 1080

# ... other settings ...
```

## How It Works

When `geminiSocks5ProxyEnabled` is set to `1`, all requests to the Gemini API will be routed through the specified SOCKS5 proxy server. This allows you to:

1. Bypass regional restrictions
2. Improve connection stability
3. Add an extra layer of privacy

Note: Only Gemini API requests are routed through the SOCKS5 proxy. All other requests will continue to use the existing HTTP proxy configuration (if enabled) or direct connections.

## Requirements

- A working SOCKS5 proxy server
- The `socks-proxy-agent` npm package (automatically installed)

## Troubleshooting

If you encounter issues with the SOCKS5 proxy:

1. Verify that your SOCKS5 proxy server is running and accessible
2. Check that the host and port are correct
3. Ensure your proxy server supports the SOCKS5 protocol
4. Check the application logs for any error messages related to proxy connections

## Disabling SOCKS5 Proxy

To disable SOCKS5 proxy for Gemini API requests, simply set `geminiSocks5ProxyEnabled` to `0` in your settings file:

```ini
geminiSocks5ProxyEnabled: 0
```