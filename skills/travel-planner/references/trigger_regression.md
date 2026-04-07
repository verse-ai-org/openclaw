# Skill trigger regression (manual)

Use after changing `SKILL.md` **description** or scope. Goal: load on real travel logistics; stay off generic chit-chat.

## Should tend to activate `travel-planner`

- "Plan a 10-day trip to Japan with trains and one base in Tokyo."
- "7-day Xinjiang itinerary, no self-drive, mid-July."
- "Compare two routes for Yunnan—Lijiang loop vs Shangri-La first."
- "Booking-ready: hotels under $200 near X, flights from SFO, family of four."
- "Pre-trip checklist and packing for Iceland in February."
- "We missed our train—reschedule day 3 of this plan."

## Should usually not activate (or only light help without full workflow)

- "What's the weather in Paris tomorrow?"
- "Write a Python function to parse CSV."
- "Draft a fantasy novel chapter about dragons."
- "Translate this email to Spanish." (no travel logistics)

## Edge cases

- **Weather + trip:** If the user is clearly mid-itinerary ("we're in Chengdu day 2, is it safe to drive to X today?"), treat as in-trip support—skill applies.
- **Vague trip:** One word ("Japan?")—clarify with 1–2 questions before heavy scripts; skill still applies if they want planning.
