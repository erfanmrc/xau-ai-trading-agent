# XAU AI Trading Agent - Fixed Structure

This version fixes the Vercel error caused by flattening the Next.js folders.

IMPORTANT: upload the extracted project while preserving ALL folders.

Architecture:
Twelve Data -> Vercel -> Market Engine -> SP2L / PRO BTB / MicroMap -> Risk -> Telegram

The three strategies are independent; confluence is optional.

Required Vercel environment variables:
TWELVE_DATA_API_KEY
TELEGRAM_BOT_TOKEN
TELEGRAM_CHAT_ID
CRON_SECRET

Build command: npm run build
