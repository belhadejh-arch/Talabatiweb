---
name: Telegram driver linking
description: How TALABAT obtains driver Chat IDs and keeps Telegram delivery independent from WhatsApp
---

Telegram Chat IDs cannot be inferred from a driver's phone or name. The driver must open the configured bot and send `/start`; the backend can then read recent message chats through Telegram `getUpdates`. A bot `getMe` check verifies the backend-only token without exposing it.

**Why:** Telegram requires the user to initiate the chat before the bot can send a direct message, and multiple drivers may share the same display name.

**How to apply:** Link the Chat ID to the selected driver record (including its restaurant), prefer an active linked driver during automatic dispatch, send Telegram and WhatsApp independently after order persistence, and record `SENT` or `FAILED` separately so one channel never blocks order creation.

Telegram `getUpdates` allows only one polling consumer per bot. Use a PostgreSQL advisory lock when multiple API processes may share a database, and stop any separately deployed bot instance before validating inbound updates.

**Why:** Telegram returns a Conflict error when another service polls the same bot, which otherwise makes driver `/start` and button actions appear broken even though the API is healthy.

**How to apply:** Keep one active polling owner per bot. Treat repeated Conflict errors as an environment/deployment issue, not a database or driver-linking failure.