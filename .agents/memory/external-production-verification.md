---
name: External production verification
description: Distinguishing Vercel deployment links from the public production alias when checking this project's release.
---

GitHub deployment status can report success for an immutable Vercel URL that redirects anonymous visitors to Vercel login. This does not establish that the public production alias is inaccessible: verify the actual alias independently, including its API rewrite to Render. Several Vercel project deployments may be reported for the same commit.

**Why:** Treating the protected immutable URL as the customer-facing site gives a false failure, while treating a successful build as proof of public API routing gives a false success.

**How to apply:** Check both the deployment status and the public alias with unauthenticated HTTP requests; check Render's health and protected admin endpoints separately. Do not infer the production API's database solely from a development connection.