---
name: TALABAT WP Sender integration
description: Durable constraints for the TALABAT WhatsApp dispatch integration
---

Use WP Sender Developer API only for driver WhatsApp dispatch. The provider contract uses `X-API-Key`, a configurable API base URL, `POST /messages/send`, and the documented JSON fields `recipients`, `message`, `contentType`, and `sender_number`. The API key, URL, and session ID belong in Replit Secrets and must never be exposed by frontend code.

**Why:** The project requirements explicitly replaced the earlier WapiSender and Telegram approach, and provider payloads must come from the official OpenAPI document rather than assumptions.

**How to apply:** Keep dispatch backend-only, select only ACTIVE drivers with a restaurant-scoped WhatsApp number, persist the order before sending, and record SENT/FAILED delivery logs when the provider is unavailable or rejects a request.