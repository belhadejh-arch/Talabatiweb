---
name: OneSignal driver push
description: OneSignal driver targeting and the credential requirement for this project
---

Driver push uses OneSignal Web SDK v16, logs each driver's external ID as the numeric driver ID, records the returned subscription ID, and prefers sending to the saved subscription ID before falling back to that external ID. The REST credential must be a valid REST API key for the same OneSignal App; an invalid or wrong-scope key returns HTTP 401 before recipient matching is evaluated. OneSignal can return HTTP 200 with an `errors` object or an empty notification ID, so both must be treated as failed delivery.

**Why:** A present secret is not proof that OneSignal accepts it. Testing the notification endpoint with a nonexistent external ID safely distinguishes credential failure from missing driver subscriptions.

**How to apply:** Keep the REST key server-only, verify it against `POST /notifications` without a real recipient before end-to-end testing, register the subscription after the explicit permission action, and inspect the logged HTTP status and response body for every push attempt.