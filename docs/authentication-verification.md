# Stage B authentication verification

Verified on October 17, 2026. The application uses the existing Supabase project configuration in ignored `.env.local`. No credentials, session tokens or test passwords are included in this report or committed files.

## Hosted project results

| Check                                             | Result         | Evidence                                                                                                                                                |
| ------------------------------------------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Email signup and confirmation settings            | Passed         | Auth settings endpoint returned 200; email enabled, signup allowed, automatic confirmation disabled                                                     |
| Public event directory                            | Passed         | Anonymous request returned 200 and an empty event list                                                                                                  |
| Private profiles protected from anonymous access  | Passed         | Anonymous request denied with 401 / PostgreSQL permission code `42501`                                                                                  |
| Member access RPC protected from anonymous access | Passed         | Anonymous invocation denied with 401 / `42501`                                                                                                          |
| Signup through the application                    | Passed         | Supabase returned 200 for a new test account; UI requested email confirmation                                                                           |
| Email confirmation                                | Passed         | Project owner clicked the confirmation link; subsequent live login succeeded                                                                            |
| Login and member data                             | Passed         | Supabase issued a session and the member area loaded its profile/access data                                                                            |
| Profile update and persistence                    | Passed         | Temporary bio saved through the UI, survived reload, and the original bio was restored                                                                  |
| Session persistence                               | Passed         | Member area and profile remained accessible after a browser reload                                                                                      |
| Logout                                            | Passed         | App returned to the demo and the Supabase session entry was removed from browser storage                                                                |
| Password recovery                                 | Owner verified | The project owner reported a successful recovery test. The agent's separate email request returned 429 `over_email_send_rate_limit`; it was not retried |

Signup/login used an isolated browser with a temporary password kept only in process memory. A second isolated browser let the owner enter an existing account's password directly for member checks; that password was not read or logged. The existing member's original bio was restored and the test session was logged out. The newly registered test account remains available to its owner; its temporary signup password was not retained. The owner can use password recovery to choose a password.

## Reproduced issues and fixes

- Reloading a recovery page lost the password-update screen. Recovery intent is now captured before the SDK consumes the URL and restored when an authenticated recovery session exists.
- Invalid or expired email links silently returned to the demo. They now display a useful authentication error; recovery links offer a new reset request.
- Whitespace-only signup names were accepted by the browser. The trimmed name is now validated before submitting signup.
- Session initialization had no loading state or surfaced error handling. The app now waits for restoration before displaying editable demo/member pages, and handles initialization errors.
- Authentication failures now use an accessible alert. Auth navigation is disabled while a request is pending.
- Completing or dismissing authentication removes callback parameters while preserving unrelated page query parameters and anchors.

No SQL migrations, event permissions, branding or layout were changed.

## Automated verification

- `npm run check`: strict TypeScript and ESLint.
- `npm test`: 10 unit checks, including recovery intent and callback URL cleanup.
- `npm run test:e2e`: 26 browser checks with intercepted Supabase fixtures, including valid/expired recovery callbacks, recovery reload, reset redirects, signup validation, invalid credentials, suspended members, expired sessions, delayed token refresh, existing demo/member transitions and desktop/mobile reference comparisons.
- `npm run build`: production build.

The new authentication browser checks use the real Supabase JavaScript client with intercepted service responses. Those checks validate application behaviour, not hosted email delivery. The separate live checks above identify what was exercised against the connected project.

Photo upload, interest-selection controls and neighborhood editing are documented in the subsequent [member profile change](member-profiles.md). Hosted Storage uploads and full admin screens were outside this authentication verification change.
