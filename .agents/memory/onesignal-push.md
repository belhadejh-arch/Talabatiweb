---
name: OneSignal driver push
description: OneSignal driver targeting and the credential requirement for this project
---

Driver push uses OneSignal Web SDK v16, logs in each driver with the numeric driver ID as the external ID, and records the returned subscription ID only after browser permission is granted and the subscription is opted in. Backend targeting must use the current authenticated driver's identity and an opted-in subscription for the same App ID; never fall back to external-ID targeting when no active subscription exists. Older subscriptions must be ineligible so a reinstall or device switch cannot create duplicate or stale alerts. The REST credential must be a valid REST API key for the same OneSignal App; an invalid or wrong-scope key returns HTTP 401 before recipient matching is evaluated. OneSignal can return HTTP 200 with an `errors` object or an empty notification ID, so both must be treated as failed delivery.

**Why:** A present secret is not proof that OneSignal accepts it. Testing the notification endpoint with a nonexistent external ID safely distinguishes credential failure from missing driver subscriptions.

**How to apply:** Keep the REST key server-only, verify it against `POST /notifications` without a real recipient before end-to-end testing, register the subscription after the explicit permission action, derive the stored external ID from the authenticated session, reject subscription IDs owned by another driver, deactivate older subscriptions for that driver, and inspect the logged HTTP status and response body for every push attempt.