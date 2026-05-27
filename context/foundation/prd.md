---
project: "Vena"
version: 1
status: draft
created: 2026-05-27
context_type: greenfield
product_type: web-app
target_scale:
  users: small
  qps: low
  data_volume: small
timeline_budget:
  mvp_weeks: 3
  hard_deadline: null
  after_hours_only: true
---

# Vena — Product Requirements Document

## Vision & Problem Statement

Blood donors cannot reliably tell when they are next allowed to donate. The earliest permissible date depends on the type of the last donation (whole blood, plasma, platelets), the donor's sex, and their donation history. A donor deciding whether to go to the center has no easy way to compute this, so they either arrive too early and are refused — a wasted trip — or wait longer than required and donate less often than they could. Their donation history typically lives only on paper or in memory, in no form that drives the calculation.

The insight: the value is the *calculation*, not a reminder. The interval logic is fiddly enough that a plain calendar alert doesn't capture it, and official systems (e-Krew / RCKiK) don't give donors a forward-looking "earliest next date, per donation type" they can act on.

## User & Persona

Primary persona: an individual blood donor managing their own donation cadence (the builder is the first concrete user). They know they donate but don't reliably remember the eligibility rules; they want to plan the next donation deliberately rather than guess. They reach for Vena at the moment they're considering going to the center — to confirm the earliest date they're allowed, ideally per donation type so they can choose what to give next.

## Success Criteria

### Primary
- A donor completes the full flow end-to-end: register → fill profile → add a donation → see the earliest next eligible date per donation type → export that date to a calendar file — and an automated E2E test covering this path passes.

### Secondary
- Registration, login, and profile completion take a new donor under 2 minutes.
- The next-eligible date appears within ~1 second of adding or editing a donation.

### Guardrails
- The calculator's dates are correct per RCKiK rules (whole blood: 8 weeks for men / 12 weeks for women; plasma: 2 weeks; platelets: 4 weeks). A wrong date is worse than no app.
- Donor health data (blood group, Rh, sex, donation history) stays private to the account.
- The app remains usable offline after the first load and is installable on a phone.

## User Stories

### US-01: Donor sees the earliest next eligible donation date

- **Given** a logged-in donor with a completed profile (sex set) and at least one recorded donation
- **When** they open the app / add their most recent donation
- **Then** they see the earliest next eligible date for each donation type, with the type they selected highlighted

#### Acceptance Criteria
- Dates follow RCKiK rules: whole blood 8 weeks (men) / 12 weeks (women), plasma 2 weeks, platelets 4 weeks, measured from the most recent relevant donation.
- The next-eligible date appears within ~1 second of adding or editing a donation.
- With no donations recorded, the donor sees an explanatory empty state, not a blank or error.
- The selected next-donation date can be exported to a one-click .ics file.

## Functional Requirements

### Account & profile
- FR-001: Donor can register with email and password. Priority: must-have
  > Socratic: Counter considered: "local-only on-device data would be cheaper than auth." Resolution: kept; cross-device access and not losing history justify server accounts.
- FR-002: Donor can log in and log out. Priority: must-have
  > Socratic: Counter considered: bundled with the local-only objection above. Resolution: kept alongside FR-001.
- FR-003: Donor can set and edit their profile (blood group, Rh, sex). Priority: must-have
  > Socratic: Counter considered: "only sex affects the interval — blood group/Rh are dead fields in the MVP." Resolution: kept; they are trivial to store, natural on a donor profile, and seed future features. Sex is the only field the calculator reads.

### Donations
- FR-004: Donor can add a donation record (date + type: whole blood / plasma / platelets). Priority: must-have
  > Socratic: Counter considered: "calc only needs the latest donation per type, so skip a full add flow." Resolution: kept; recording each donation is the natural model and the calc reads the latest.
- FR-005: Donor can view a list of their own donations. Priority: must-have
  > Socratic: Counter considered: "list is secondary to the calculator." Resolution: kept; the list is load-bearing — edit/delete act on it and donors want to see their record.
- FR-006: Donor can edit a donation record. Priority: must-have
  > Socratic: Counter considered: "delete + re-add could replace edit." Resolution: kept; mistyped dates are the common correction path and deserve a direct edit flow.
- FR-007: Donor can delete a donation record. Priority: must-have
  > Socratic: Counter considered: "deleting the latest donation silently recomputes an earlier eligible date — confusing." Resolution: kept; the recompute is correct behavior. (Watch: a confirm/guard on delete is worth considering downstream.)

### Eligibility calculator
- FR-008: Donor sees the earliest next eligible date for each donation type, computed from their last donation, sex, and donation type. Priority: must-have
  > Socratic: Counter considered: "show only the chosen type's date." Resolution: kept per-type; the side-by-side per-type view is the differentiator official systems don't offer.
- FR-009: Donor can select which donation type they plan to give next. Priority: must-have
  > Socratic: Counter considered: "selection is redundant since all dates are shown." Resolution: kept; the selection drives which date goes into the .ics export.

### Calendar export
- FR-010: Donor can export the earliest next eligible date as an .ics calendar file. Priority: must-have
  > Socratic: Counter considered: "a displayed date may suffice; defer .ics to v2." Resolution: kept; one-click into the donor's real calendar is the action that makes the app stick.

### PWA
- FR-011: Donor can install the app on their phone and use it offline after the first load. Priority: must-have
  > Socratic: Counter considered: "service worker + cache + install testing is real cost the calc doesn't strictly need." Resolution: kept; phone-installable and offline-usable is an explicit success criterion.

## Non-Functional Requirements

- Computed dates are correct per RCKiK rules (whole blood 8 wk men / 12 wk women, plasma 2 wk, platelets 4 wk); an incorrect date is a release-blocking defect.
- The earliest-next-date result is visible within ~1 second of the donor adding or editing a donation.
- A donor's health data (blood group, Rh, sex, donation history) is never visible to any other account.
- The app remains usable offline after the first successful load.
- The app is installable on a phone home screen and usable on the latest two major versions of mainstream mobile browsers.
- An exported calendar file imports in one tap into Google, Apple, and Outlook calendars without manual editing.
- The MVP user interface is Polish-only.

## Business Logic

Given a donor's most recent donation of each type and their sex, Vena computes the earliest date they are permitted to donate each type again by applying RCKiK-mandated minimum intervals.

The rule consumes three user-facing inputs: the date of the donor's last donation (per type), the donor's sex, and the donation type in question. It produces, per type, the earliest permissible next date — the last donation date plus the type-and-sex-specific minimum interval: whole blood 8 weeks for men / 12 weeks for women, plasma 2 weeks, platelets 4 weeks. The donor encounters the output immediately after recording (or editing) a donation: the app shows all three per-type dates side by side, and the donor selects the type they plan to give next to carry that date into a calendar export.

When the donor has no recorded donations, there is no last-donation date to anchor the calculation, so the app shows an explanatory empty state rather than a computed date.

## Access Control

Email + password registration and login. Each donor owns an account; their profile (blood group, Rh, sex) and donation history are private to that account and accessible only when authenticated. Flat single-role model — every user is a donor who sees only their own data. No admin role, no sharing, no social login in the MVP. Unauthenticated access to any data-bearing route redirects to login.

## Non-Goals

- **No integration with e-Krew / official RCKiK systems.** Donors enter their history manually; avoids a heavy, uncertain external integration for v1.
- **No donation statistics or gamification** (liters donated, badges, streaks) — keeps the product focused on the eligibility calculation.
- **No tracking of health parameters** (iron, hemoglobin, other lab values) — out of scope for an eligibility-date tool.
- **No donation-center finder or map** — Vena answers "when", not "where".
- **No educational content** ("how to donate", "what happens to blood").
- **No doctor-sharing or PDF certificate export** — data stays in the donor's own account.
- **No social login (Google/Apple)** — email + password only for the MVP.
- **No admin panel** — flat single-donor model with no management surface.
- **Not multilingual** — Polish-only for the MVP.

## Open Questions

1. **Are push reminders/notifications in or out of scope?** — The seed notes listed push reminders as out-of-MVP, but it was not confirmed as a locked non-goal during shaping. Owner: user. Resolve before/at PRD sign-off. (If out, the .ics export is the sole reminder mechanism; if in, it adds notification scope.)
2. **How broadly does Vena generalize beyond the initial single user?** — Persona is currently "individual donor / builder is first user." Owner: user. Non-blocking.
