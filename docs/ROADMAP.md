# Roadmap

## 1. Validate the existing iPhone workflow

Acceptance: a real Shortcut transfers one chosen-source reading, the user previews and saves it, and the same value remains after reopening the tracker. Check empty results, denied Health permissions and conflicting edits. No background-sync claim before this works.

## 2. Activate direct ChatGPT tools when supported

Dependency: hosting-account MCP capability and returned connection metadata.

Acceptance: an authorised ChatGPT session reads only the user's records, performs one requested write, handles a repeated request without duplication, and the website reflects the saved result. Keep copy-and-chat available while activation is blocked.

## 3. Create a native iPhone application

Proposed starting point: reuse the web interface in a Capacitor shell and implement a native HealthKit bridge, while adapting authentication to the native app lifecycle. This proposal has not been implemented.

Acceptance for the first device build: authenticate, request selected Health permissions, read one supported metric, review/save it and confirm persistence after reopening. Then verify permission revocation, foreground refresh and duplicate handling before adding background delivery.

Signing, Apple developer setup and an actual iPhone build are required before TestFlight distribution. App Store release follows device validation and the required store submission work.

## 4. Reliability improvements

- Add browser-level tests for edit conflicts, local sign-in and Health selection.
- Implement a versioned export-restore flow with preview and validation.
- Resolve the existing ESLint backlog before enabling it as a required CI gate.
- Add consent-aware account data deletion and retention controls.
- Consider offline behaviour and notifications only after the native and sync foundations are stable.

Features here are plans, not shipped capabilities or delivery promises.
