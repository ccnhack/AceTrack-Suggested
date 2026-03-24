# AceTrack Suggested — Expert Improvements Testing Guide

This guide provides step-by-step instructions to verify the **59 improvements** implemented based on the expert panel review.

> [!IMPORTANT]
> Ensure you are in the `AceTrack Suggested` directory and have run `npm install`.
> Launch the app locally: `npx expo start` (then press `a` for Android).

---

## 1. Unified Expert Hub (New)
1. **Action**: Go to the **Profile** tab.
2. **Expectation**: You should see a "Quick Actions" grid with tiles for **Matchmaking**, **Coach Directory**, **Subscriptions**, and **Calendar**.
3. **Verification**: Click each tile to ensure the screen opens and navigation is smooth.

## 2. Matchmaking & City Discovery
1. **Action**: Open **Matchmaking** from the Profile hub.
2. **City Filter**: Tap the location icon to cycle through cities (Bangalore, Mumbai, Delhi).
3. **Expectation**: Opponent cards should update to show distance relative to the selected city.
4. **Action**: Click "Challenge" on an opponent.
5. **Expectation**: The button should change to "Requested".

## 3. High-Contrast Live Scoring
1. **Action**: As a coach (or using a tournament you created), go to **Matches** and find a "Started" tournament.
2. **Action**: Click the **Live Score** button.
3. **Expectation**: A dark-mode, high-contrast interface opens with large +1 buttons.
4. **Verification**: Test the "Undo" button and verify that winning a set (e.g., 21 points for Badminton) automatically advances the set counter.

## 4. Coach Directory & Booking
1. **Action**: Open **Coach Directory** from the Profile hub.
2. **Expectation**: A list of verified coaches appears with their "Exp" and "Rate".
3. **Verification**: Clicking "Book Session" should trigger a success alert.

## 5. Academy Operations
1. **Broadcast**: Go to **Academy Hub** (if own/admin) → **Broadcast** tab.
2. **Action**: Send a test announcement.
3. **Verification**: UI should show "Message Broadcasted Successfully".
4. **Subscription**: Click **Subscriptions** in Profile hub and verify you can select Basic/Pro/Enterprise plans.

## 6. Security & Hardening
1. **API Security**: Attempt to access `https://acetrack-suggested.onrender.com/api/admin/secure-data` in a browser.
2. **Expectation**: Should return a 401/403 (Unauthorized) because it requires a Bearer token.
3. **Rate Limit**: Refresh the Explore tab rapidly 100+ times.
4. **Expectation**: "Too many requests" (429) error should appear.

---

## 7. Advanced Expert Features (Round 2)

### 7.1 Searchable City Selection
- **Role:** Login as `User`.
- **Action:** Open `Explore` or `Matchmaking`. Tap the location picker.
- **Action:** Use the Search Bar to find "Whitefield" or "Mumbai".
- **Verification:** The list filters dynamically. Selecting a city closes the modal and updates the tournament/opponent feed.

### 7.2 Match Request Cancellation
- **Action:** In `Matchmaking`, click **Challenge** on any player.
- **Action:** Once it changes to **Requested**, click it again.
- **Verification:** A prompt appears asking "Cancel Request?". Confirming changes the button back to **Challenge**.

### 7.3 Advanced Live Scoring & Team Evaluations
- **Action:** Start a tournament match (Academy/Coach view) and open **Live Scoring**.
- **Action:** Observe the **Evaluate** button below the `+1` increment for each player.
- **Action:** Click Evaluate. Answer the sport-specific questions (Badminton/TT) and save.
- **Action:** (Doubles) Verify both players in a team have individual Evaluate buttons.
- **Action:** Use the **Reset Match** button (top right) and confirm.
- **Verification:** Score resets to 0-0. Verified performance data is stored in the player's history.

### 7.4 Coach Booking & Availability Hub
- **Action (User):** Go to **Profile -> Coach Directory** and select a coach -> **Book**.
- **Action:** Pick a date from the calendar and a time slot.
- **Verification:** Confirmation dialog appears and request status is tracked.
- **Action (Coach):** Login as Coach -> **Profile -> My Bookings** (labeled "Matchmaking" for users).
- **Action:** Click **Block Dates**. Select dates on the calendar to mark as unavailable.
- **Verification:** Blocked dates are highlighted and unavailable for user booking.

### 7.5 Targeted Academy Broadcasting
- **Action:** Login as Academy -> **Academy Hub -> Broadcast**.
- **Action:** Select a specific tournament from the horizontal list.
- **Action:** Choose audience (Registered / Future / All) and send message.
- **Verification:** Only participants of the selected tournament/segment are targeted.

---
**Note:** Some features use mock data (e.g., matching opponents) but the logic and UI flows are fully integrated and ready for production API binding.

