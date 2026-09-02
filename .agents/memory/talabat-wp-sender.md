---
name: TALABAT WP Sender integration
description: Durable constraints for the TALABAT WhatsApp dispatch integration
---

Use WP Sender Developer API only for driver WhatsApp dispatch. The production base URL must come from the provider's OpenAPI `servers` list, currently `https://backendapi.wpsenderx.com/api`. The provider contract uses `X-API-Key`, `POST /messages/send`, and the documented JSON fields `recipients`, `message`, `contentType`, and `sender_number`. Keep the API key backend-only; persist the active session ID in PostgreSQL after creation.

**Why:** The project requirements explicitly replaced the earlier WapiSender and Telegram approach, and the user specifically required the production server to be discovered from `https://www.wpsenderx.com/api-docs.json` rather than manually entered or guessed.

**How to apply:** Keep dispatch backend-only, select only ACTIVE drivers with a restaurant-scoped WhatsApp number, persist the order before sending, and record SENT/FAILED delivery logs when the provider is unavailable or rejects a request.