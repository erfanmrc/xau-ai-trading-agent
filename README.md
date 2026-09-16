# XAU AI Trading Agent — Batch 3: Zone-aware BTB

این Batch، BTB را به Zone Engine متصل می‌کند.

منطق فعلی:
1. Zone قبلی از Spike / FVG / Breakout
2. خروج قیمت از Zone
3. بازگشت قیمت به Zone
4. Confirmation
5. Risk Engine
6. VALID / WATCH / INVALID

فایل‌ها:
- lib/strategy/btb/detector.ts
- lib/strategy/mtf-engine.ts

نکات مهم:
- این نسخه BTB یک implementation deterministic و اولیه است.
- هنوز ادعا نمی‌شود که تمام جزئیات BTB منبع Poursamadi را 100% بازسازی کرده است.
- Micro-MAP همچنان سیگنال معاملاتی تولید نمی‌کند.
- spread فعلاً از API به Engine پاس می‌شود ولی برای BTB در این Batch همچنان 0 در Risk Engine استفاده می‌شود؛ در مرحله Execution/Backtest باید spread واقعی وارد شود.
- بعد از Deploy، تست اصلی endpoint فعلی strategy/analyze است.
