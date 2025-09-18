# Google Sheets Service Account Integration

This document explains how to set up Google Sheets integration using Service Account authentication, which is the recommended approach for secure access to Google Sheets.

## Setup Instructions

### 1. Create a Google Cloud Project

1. Go to the [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Enable the Google Sheets API for your project

### 2. Create a Service Account

1. In the Google Cloud Console, navigate to "IAM & Admin" > "Service Accounts"
2. Click "Create Service Account"
3. Give it a name and description
4. Grant it the "Editor" role or create a custom role with Sheets permissions
5. Click "Done"

### 3. Create and Download Service Account Key

1. On the Service Accounts page, click on your newly created service account
2. Go to the "Keys" tab
3. Click "Add Key" > "Create new key"
4. Select "JSON" format
5. Click "Create" - this will download a JSON file

### 4. Rename and Place the Service Account File

1. Rename the downloaded JSON file to `service-account-key.json`
2. Place it in the `config` directory of your FunPayServer project

If you already have a service account file, you can use it directly. The default path is `./config/service-account-key.json`.

### 5. Share Your Google Sheet

1. Open your Google Sheet
2. Click the "Share" button
3. Add the service account email (found in the JSON file under `client_email`) with "Editor" permissions

## Configuration

The integration is configured through the `settings.txt` file:

```ini
# Включить использование Google Sheets для FAQ. [1 - включить, 0 - выключить]
googleSheetsFAQEnabled: 1

# ID таблицы Google Sheets
googleSheetsId: YOUR_SHEET_ID_HERE

# Путь к файлу учетных данных сервисного аккаунта Google
googleSheetsServiceAccountPath: ./config/service-account-key.json

# Диапазон ячеек в таблице (по умолчанию FAQ!A:B)
googleSheetsRange: FAQ!A:B

# Имя листа для обратной связи в таблице Google Sheets
googleSheetsFeedbackSheetName: Feedback

# API ключ для Gemini AI (опционально, для улучшенных ответов)
googleSheetsGeminiApiKey: YOUR_GEMINI_API_KEY_HERE
```

## Sheet Structure

### FAQ Sheet
The FAQ sheet should have the following structure:
- Column A: Questions
- Column B: Answers

Example:
| Question | Answer |
|----------|--------|
| Как оплатить заказ? | Оплату можно произвести через ... |
| Когда будет доставка? | Доставка осуществляется в течение ... |

### Feedback Sheet
The Feedback sheet will be automatically created with the following structure:
- Column A: Question ID
- Column B: Question
- Column C: AI Generated Answer
- Column D: Approved Answer (filled when approved)
- Column E: Status (pending/approved/rejected)

## Benefits of Service Account Authentication

1. More secure than API keys
2. Better access control
3. No need to manually refresh tokens
4. Can be easily revoked if compromised
5. Supports multiple scopes and services

## Troubleshooting

### "Service account file not found"
- Ensure the `service-account-key.json` file exists in the `config` directory
- Check file permissions

### "Insufficient permissions"
- Verify the service account has Editor access to the Google Sheet
- Check that the sheet ID is correct

### "Failed to initialize Google Sheets"
- Ensure the Google Sheets API is enabled in your Google Cloud project
- Check that the service account JSON file is valid