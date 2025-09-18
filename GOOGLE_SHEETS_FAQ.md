# Google Sheets FAQ Integration

## Overview

This feature allows the bot to automatically respond to customer questions using FAQ data stored in Google Sheets. When a customer asks a question that matches an entry in your FAQ sheet, the bot will automatically respond with the corresponding answer.

Additionally, when the bot encounters a complex question that doesn't match any FAQ entries, it can use Gemini AI to generate a response. These AI-generated responses can be reviewed and approved through the feedback system.

## Setup Instructions

### 1. Create Google Sheets

1. Create a new Google Sheet for your FAQ data
2. In the first worksheet (tab), name it "FAQ" and structure it as follows:
   - Column A: Question
   - Column B: Answer
3. Add your FAQ entries starting from row 2 (row 1 should contain headers)
4. Create a second worksheet (tab) named "Feedback" with the following structure:
   - Column A: ID
   - Column B: Question
   - Column C: AI Answer
   - Column D: Correct Answer
   - Column E: Status

### 2. Configure Google Service Account Authentication

1. Follow the detailed instructions in [GOOGLE_SHEETS_SERVICE_ACCOUNT.md](GOOGLE_SHEETS_SERVICE_ACCOUNT.md) to set up a Google Service Account
2. Download the service account credentials JSON file
3. Place the file in the `config` directory and name it `service-account-key.json`
4. Share your Google Sheet with the service account email (found in the credentials file) with Editor permissions

### 3. Configure Settings

Edit your `settings.txt` file to enable and configure Google Sheets FAQ:

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

### 4. Test the Integration

1. Restart your FunPay Server
2. Check the logs for successful Google Sheets initialization
3. Ask a question that matches one of your FAQ entries
4. The bot should automatically respond with the corresponding answer

## How It Works

1. When the server starts, it loads FAQ data from your Google Sheet
2. When a customer sends a message, the system checks if it matches any FAQ entries:
   - First, it looks for exact matches
   - Then, it tries partial matches with relevance scoring
   - Finally, it uses keyword-based matching as a fallback
3. If a match is found, the bot automatically responds with the corresponding answer
   - This allows for more flexible and intelligent responses to customer questions
4. If no match is found and Gemini AI is enabled:
   - The system uses Gemini AI to generate a response based on your FAQ data
   - The complex question and AI-generated response are saved to the feedback sheet
   - You can review these responses and approve or modify them
   - Approved responses can be added to your main FAQ sheet

## Feedback System for Complex Questions

When the bot encounters a complex question that requires AI generation:

1. The question and AI-generated response are saved to your feedback sheet
2. The status is marked as "pending"
3. You can review these responses through the Telegram bot or by checking the feedback sheet directly
4. You can approve the AI response or provide a better one
5. Approved responses can be added to your main FAQ sheet to improve future responses

## Refreshing FAQ Data

The FAQ data is fetched when the server starts and then refreshed periodically. You can also manually refresh by restarting the server.

## Troubleshooting

- Ensure your Google Sheet is shared with the service account email
- Verify the service account credentials file is correctly placed
- Check that the cell range matches your data structure
- Look at the logs for any error messages related to Google Sheets integration
- For Gemini integration issues:
  - Check that your API key is valid and has the necessary permissions
  - Verify that the model name is correct (using `gemini-1.5-flash`)
  - Ensure your API key quota has not been exceeded
  - Note that gemini-1.5-flash has better quota limits than gemini-1.5-pro
- For feedback sheet issues, ensure the sheet has the correct structure (ID, Question, AI Answer, Correct Answer, Status)

## Security Notes

- Keep your service account credentials file secure
- Consider setting up billing alerts in Google Cloud Console
- The Google Sheet should only contain public FAQ information
- Monitor your API usage to prevent unexpected charges