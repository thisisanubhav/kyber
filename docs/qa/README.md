# Live QA flow breaks and fixes

This document records the findings from the 29 September 2026 live audit and
the corresponding UI changes implemented in this repository. The **before**
screenshots are evidence from the live sites. The **after** screenshots were
captured on 30 September 2026 from the local fixed build at 1440 px desktop or
390 × 844 mobile.

The original audit distinguished one confirmed functional defect from three
product and conversion recommendations. That distinction is preserved below.

## Confirmed bug: password recovery validation

**Before:** A malformed address started an account lookup, returned “Couldn't
find your account,” and caused the unrelated Sign in button to display its
loading state.

**After:** Recovery validates the address before any request, displays “Enter a
valid email address,” keeps Sign in independent, uses “Sending recovery email…”
for an actual recovery request, and clears stale recovery errors when Email is
edited. Empty-field validation remains intact.

| Before — live bug | After — local fixed build at 390 px |
| --- | --- |
| ![Malformed email incorrectly reported as an unknown account](images/before/password-recovery-invalid-email.jpg) | ![Malformed email stopped by format validation](images/after/password-recovery-invalid-email.png) |

Regression coverage is in
[`app/src/Login.test.jsx`](../../app/src/Login.test.jsx).

## Product decision: invite-only registration

The registration-code requirement was not bypassed. The fixed screen explicitly
states that accounts are invite-only, explains where codes come from, and gives
prospective customers a working **Request access / Contact sales** route using
the existing booking destination.

| Before — code gate without an access path | After — policy and access path at 390 px |
| --- | --- |
| ![Registration code gate without request access](images/before/signup-code-gate.jpg) | ![Invite-only explanation and Request access link](images/after/signup-code-gate.png) |

Regression coverage is in
[`app/src/Register.test.jsx`](../../app/src/Register.test.jsx).

## Conversion change: homepage sales action

The working sales destination previously appeared in the desktop header and
inside the mobile Menu, but not alongside the homepage value proposition. A
**Book a call** action now appears directly in the hero on desktop and mobile,
while the existing header actions remain available.

### Desktop

| Before — booking separated from the value proposition | After — hero booking action |
| --- | --- |
| ![Homepage before adding a hero sales action](images/before/homepage-sales-cta-desktop.jpg) | ![Homepage with Book a call in the hero](images/after/homepage-sales-cta-desktop.png) |

### Mobile

| Before — Contact Sales available only after opening Menu | After — Book a call visible in the hero at 390 px |
| --- | --- |
| ![Mobile menu containing Contact Sales](images/before/homepage-sales-cta-mobile.jpg) | ![Mobile homepage with a visible Book a call action](images/after/homepage-sales-cta-mobile.png) |

## Product decision: career introduction video

The initial application now requires the CV but makes the one-minute video
optional. Copy explains that the video helps the team understand motivation and
may instead be provided later. MP4, MOV, WebM, and 50 MB validation remains in
place whenever a video is selected.

| Before — video required at initial application | After — video explicitly optional |
| --- | --- |
| ![Career form with required one-minute video](images/before/career-video-required.jpg) | ![Career form with optional one-minute introduction](images/after/career-video-optional.png) |

Regression coverage is in
[`website/src/App.test.jsx`](../../website/src/App.test.jsx).

## Verification and limits

- Unit and component coverage verifies recovery validation and loading states,
  the registration access route, hero CTA placement, and optional video rules.
- The local backend integration test covers registration, email verification,
  recovery, session behavior, and a controlled application journey.
- The fixed screenshots were inspected for sensitive account or customer data
  before being added to the repository.
- No production chat message, booking, account creation, valid-address recovery
  request, file upload, or job application was submitted. These downstream
  production outcomes remain unverified.
- These screenshots document the implementation; they are not evidence of a
  production deployment.
