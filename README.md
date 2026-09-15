# XAU AI Trading Agent

Initial Vercel/Next.js implementation for the XAUUSD AI trading assistant.

## Architecture

- Vercel / Next.js
- Twelve Data market data
- Telegram Bot API
- Independent SP2L / PRO BTB / MicroMap strategy modules
- Risk engine
- Market structure engine

## 1. Install

```bash
npm install
npm run dev
```

## 2. Environment variables

Copy `.env.example` to `.env.local` and set:

- `TWELVE_DATA_API_KEY`
- `TWELVE_DATA_SYMBOL=XAU/USD`
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_CHAT_ID`
- `CRON_SECRET`

Do not commit `.env.local`.

## 3. Test

Open:

- `/api/health`
- `/api/market`

## 4. Telegram

The morning report endpoint sends a Telegram message.

## 5. Important

This is the first executable foundation, not a finished profitable trading system.

Before live use, add:

- economic calendar/news provider
- persistent database/journal
- proper liquidity engine
- exact SP2L rules from the source material
- exact PRO BTB rules
- exact MicroMap rules
- strategy-specific scoring
- spread/slippage handling
- historical backtesting
- walk-forward validation
- challenge state/risk tracking
- alert deduplication
- live intraday scheduler/stream
- optional broker execution layer

Never treat a detected setup as a guaranteed trade.
