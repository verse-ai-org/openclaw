---
name: travel-planner
description: This skill should be used whenever users need help planning trips, creating travel itineraries, managing travel budgets, or seeking destination advice. On first use, collects comprehensive travel preferences including budget level, travel style, interests, and dietary restrictions. Generates detailed travel plans with day-by-day itineraries, budget breakdowns, packing checklists, cultural do's and don'ts, and region-specific schedules. Maintains database of preferences and past trips for personalized recommendations.
metadata:
  openclaw:
    emoji: ✈️
    requires:
      bins:
        - node
---

# Travel Planner

## Overview

This skill should act like a travel decision assistant first and a long-form itinerary writer second.
Its job is not to dump a giant travel guide immediately. Its job is to:

1. understand the traveler,
2. choose the right route or trip shape,
3. validate the big decisions with live data,
4. produce an execution-ready plan,
5. support the traveler before and during the trip.

## When to Use This Skill

Invoke this skill for travel-related tasks:

- Planning trips and creating itineraries
- Destination comparisons and route selection
- Budget planning and expense tracking
- Hotel and transport strategy
- Packing checklists
- Cultural etiquette and do's and don'ts
- Pre-trip preparation timelines
- During-trip course correction and daily briefs
- Travel preference management

## Core Principles

- Route choice matters more than adding one more attraction.
- Do not ask a giant questionnaire up front. Ask the fewest questions that meaningfully change the recommendation.
- Put transport and hotel strategy in the main answer once the user is moving toward booking.
- Arrival day and departure day should be intentionally lighter.
- Prefer one anchor activity plus one nearby secondary option over overloaded schedules.
- Treat weather, transfer friction, and energy as real constraints.

## Workflow

### Step 1: Load Preferences

Check whether travel preferences already exist:

```bash
node {baseDir}/scripts/travel_db.mjs is_initialized
```

If `false`, do a lightweight preference setup. If `true`, read the existing profile and only fill gaps relevant to the current trip.

### Step 2: Lightweight Preference Setup

When no preferences exist, do **not** ask every possible question. Start with high-impact preferences:

- Budget level: budget, mid-range, luxury
- Travel pace: relaxed, moderate, packed
- Travel companions: solo, couple, family, group
- Accommodation style: hostel, hotel, Airbnb, resort
- Main interests: food, culture, scenery, photography, adventure, beach, shopping, nightlife
- Departure city
- Transport preferences: self-drive, private driver, public transport, short flights okay
- Walking tolerance / mobility constraints

Save only what the user actually provides:

```javascript
import { savePreferences } from "{baseDir}/scripts/travel_db.mjs";

savePreferences({
  budget_level: "mid-range",
  pace_preference: "moderate",
  travel_companions: "couple",
  accommodation_preference: ["boutique hotel"],
  interests: ["nature", "food", "photography"],
  departure_city: "Shanghai",
  transport_preferences: ["private driver", "short flight okay"],
  walking_tolerance: "moderate",
});
```

From the shell (single JSON argument):

```bash
node {baseDir}/scripts/travel_db.mjs save_preferences '{"departure_city":"Shanghai","budget_level":"mid-range"}'
```

### Step 3: Create a Trip Record Early

As soon as the user is planning a concrete trip, create a structured trip record even if some fields are still unknown.

Capture:

1. Destination text or region
2. Dates or date flexibility
3. Duration
4. Budget
5. Travelers
6. Main interests
7. Constraints
8. Must-do items

```javascript
import { addTrip } from "{baseDir}/scripts/travel_db.mjs";

const trip = {
  destination_text: "Xinjiang",
  destination: {
    region: "Xinjiang",
    country: "China",
  },
  departure_date: "",
  return_date: "",
  date_flexibility: "mid-July",
  travel_month_text: "July",
  duration_days: 7,
  budget: {
    total: 14000,
    currency: "CNY",
  },
  travelers: 2,
  activities: ["nature", "photography"],
  must_do: [],
  constraints: ["does not want to self-drive"],
  transport_preferences: ["private driver", "short domestic flight okay"],
  stage: "intake",
};

const tripId = addTrip(trip, "current");
```

Shell:

```bash
node {baseDir}/scripts/travel_db.mjs add_trip '{"destination_text":"Xinjiang","destination":{"region":"Xinjiang","country":"China"},"duration_days":7,"stage":"intake"}' current
```

### Step 4: Route Framing Before Full Research

For complex destinations, do **route framing** before a full day-by-day itinerary. This is a separate stage from deep destination research.

Use route framing when the destination is broad or multi-region, such as:

- Xinjiang
- Yunnan
- Japan
- Italy
- Turkey
- Multi-country Europe trips

In this stage, answer:

- Which route family fits best?
- What should the transport style be?
- How many hotel bases should there be?
- Which popular route should be avoided for this traveler?

Use the route selector helper:

```bash
node {baseDir}/scripts/route_selector.mjs --input '<trip_request_json>'
```

Or via Node import (same helpers `index.js` uses):

```javascript
import { selectRouteCandidates } from "{baseDir}/scripts/route_selector.mjs";

const result = selectRouteCandidates(trip);
const recommended = result.recommended_route;
const alternatives = result.alternatives;
```

#### Route Framing Output Rules

At this stage, reply with:

- 1 recommended route
- 1 backup option
- why the recommendation fits this traveler
- why a common alternative is less suitable
- a short lodging strategy
- a short transport strategy

Do **not** write a full 7-day itinerary yet unless the user asks to continue after seeing the route choice.

### Step 5: Light Research and Validation

After route framing, do light validation before expanding the plan.

**Order (do not skip step 1):**

1. Run `live_validation.mjs` once with the current trip JSON, the **selected route** object from Step 4, and preferences (from `get_preferences` or `{}`). This produces the `tool_plan` you must follow.
2. Run the checks it lists (`flyai`, `12306`, `amap-lbs-skill`, etc.). Do **not** jump straight to ad hoc `flyai` calls before step 1, except quick web research (weather, closures).
3. When you have raw tool outputs, pass them through `booking_ready.mjs` (or `index.js` `booking_ready` / `auto_validate` mode) before presenting a booking-ready answer.

Validate:

1. Season and weather fit
2. Big transport feasibility
3. Hotel zone strategy
4. Whether budget and pace are realistic
5. Any major safety or closure issues
6. Whether the route can be promoted into a booking-ready plan

Use `live_validation.mjs` to generate the actual validation package:

```bash
node {baseDir}/scripts/live_validation.mjs --trip '<trip_json>' --route '<route_json>' --preferences '<prefs_json>'
```

This script does not execute live tools. It tells you:

- which `flyai search-flight` calls to run,
- which `flyai search-hotel` calls to run,
- which `flyai search-poi` checks to run,
- when to involve `12306` or `amap-lbs-skill`,
- which decision gates must be satisfied before you present booking-ready output.

If your runtime can execute tool checks directly, you can use the `travel-planner` runtime entrypoint in `auto_validate` mode to:

- generate the live validation plan,
- execute supported `flyai` checks automatically,
- merge the live results,
- synthesize `booking_ready`,
- optionally persist the results back to the trip record.

Use web research plus live tools as needed:

- `flyai` for flights, hotels, and POI/tickets
- `12306` for China train validation
- `amap-lbs-skill` for China routing, hotel area checks, and nearby search

### Delegating to Specialized Skills

Use these skills during validation and full planning. They are not optional add-ons once the user is close to booking.

**Flights** (any destination):
- Use the `flyai` skill → `search-flight` for real-time flight options, prices, and schedules.

**Hotels & Accommodation** (any destination):
- Use the `flyai` skill → `search-hotel` for real-time hotel options and availability.
- Use `keyword-search` or `ai-search` for broader idea generation.

**Attractions & Tickets** (any destination):
- Use the `flyai` skill → `search-poi` for attraction tickets, prices, and availability.
- `search-poi --category` must be one of the **enumerated Chinese categories** the `flyai` CLI accepts (for example `自然风光`, `人文古迹`). Do **not** pass generic labels like `景点` — the command exits with an error.

**China domestic trains / high-speed rail**:
- Use the `12306` skill for official real-time seat availability and schedules.
- `flyai` can also search trains, but `12306` is preferred inside China.

**China maps, POI routing & nearby search**:
- Use the `amap-lbs-skill` for routing, hotel-area checks, and nearby POI discovery.

### Step 6: Run a Validation Pass Before Booking-Ready Output

Before the detailed plan becomes booking-ready, validate the big decisions in this order:

1. **Flight / rail entry-exit pattern**
2. **Hotel base strategy**
3. **Anchor POI strength**
4. **Route transfer realism**

At this stage, your reply should explicitly say what was validated and what still needs verification.

For example:

- "Validated: Urumqi in / Yining out looks better than round-trip pricing."
- "Validated: Yining has enough hotel supply under the target nightly budget."
- "Still need to verify: whether Nalati-area transfer times are too long for Day 4."

### Step 7: Show a Plan Skeleton Before the Full Plan

Before writing a long itinerary, show a short skeleton the user can approve.

The skeleton should include:

- recommended route title
- transport strategy
- hotel-base strategy
- budget snapshot
- 2-3 key tradeoffs
- what you want the user to confirm
- whether the trip is still in `route framing` or has advanced into `booking-ready`

Use `plan_generator.mjs` as the structured source of truth for this:

```bash
node {baseDir}/scripts/plan_generator.mjs --trip-id <id>
```

Use these sections before presenting the detailed itinerary:

- `route_framing`
- `live_validation`
- `plan_skeleton`
- `booking_strategy`

### Step 8: Generate the Detailed Plan

Only after route framing is accepted **and the main validation gates are cleared** should you generate the detailed plan.

For a single structured JSON object (itinerary, budget, packing, etc.), prefer `plan_generator.mjs --trip-json ...` or the skill runtime `index.js` with `mode: "trip_plan"` once `trip` includes `selected_route` and any `live_results` you have.

If you already have live tool results for flights, hotels, or attractions, synthesize them into a booking-ready package before presenting the final recommendation:

```bash
node {baseDir}/scripts/booking_ready.mjs --trip '<trip_json>' --route '<route_json>' --validation '<live_validation_json>' --results '<live_results_json>'
```

`live_results_json` is expected to contain raw tool outputs, for example:

- `flights`: result of `flyai search-flight`
- `hotels`: result of `flyai search-hotel`
- `pois`: result of `flyai search-poi`

Use the resulting `booking_ready` section to choose:

- preferred transport option,
- preferred hotel base and top hotel candidates,
- anchor attractions worth keeping in the final plan.

The answer order should be:

1. Recommendation summary
2. Live transport and hotel validation summary
3. Transport and hotel strategy
4. Day-by-day execution cards
5. Budget breakdown
6. Packing checklist
7. Cultural and safety notes
8. Pre-trip actions

#### Booking-Ready Output Rules

When the user is close to booking, the answer should no longer say only "I can also help check hotels/flights."
Instead, it should contain:

- a preferred transport pattern,
- 2-3 hotel candidates or hotel zones,
- the key live constraints that shaped the route,
- any must-book-now items,
- remaining uncertainties if not fully validated.

#### Day-by-Day Rules

Each day should be an execution card, not just a list of attractions.

Every day should include:

- primary goal
- secondary goal
- time anchors
- transit strategy
- meal strategy
- energy load
- booking watchouts
- weather backup

Use the generated itinerary structure from `plan_generator.mjs` and fill in real POIs after validating transport and hotel choices.

### Step 9: Move Into Pre-Trip Service

Once the user likes the plan or starts booking, move the trip from exploration into execution support.

At this stage:

- lock in the route
- store selected route / route framing
- track bookings
- persist live results and booking-ready picks
- generate pre-trip checklists
- generate pre-trip briefs on demand
- prepare for future reminder delivery

You can persist the execution state with `travel_db.mjs`, for example:

```bash
node {baseDir}/scripts/travel_db.mjs save_live_results <trip_id> '<live_results_json>'
node {baseDir}/scripts/travel_db.mjs save_booking_ready <trip_id> '<booking_ready_json>'
node {baseDir}/scripts/travel_db.mjs patch_trip <trip_id> '<partial_json>'
# `update_trip` is an alias of `patch_trip` (merge fields such as stage, selected_route).
node {baseDir}/scripts/travel_db.mjs confirm_booking <trip_id> hotel '<selected_hotel_json>'
```

Suggested stage values:

- `intake`
- `route_framing`
- `plan_ready`
- `ready_to_book`
- `in_trip`
- `completed`

### Step 10: During-Trip Support

During the trip, help with:

- weather-based adjustments
- missed transport
- nearby fallback ideas
- daily spending tracking
- quick daily briefs

Generate lightweight briefs on demand with:

```bash
node {baseDir}/scripts/briefing.mjs --mode pre_trip --trip '<trip_json>' --plan '<plan_json>'
node {baseDir}/scripts/briefing.mjs --mode daily --trip '<trip_json>' --plan '<plan_json>' --day 2
```

If the user has already departed, mark the trip as active first:

```bash
node {baseDir}/scripts/travel_db.mjs start_trip <trip_id>
```

For now, brief generation may be manual or invoked by other workflow layers. A cron scheduler can be added later without changing the briefing format.

Track expenses:

```javascript
import { addExpense } from "{baseDir}/scripts/travel_db.mjs";

const expense = {
  category: "food",
  amount: 45.0,
  description: "Dinner near the old town",
  date: "2026-06-16",
};

addExpense(tripId, expense);
```

Check the budget summary:

```javascript
import { getBudgetSummary } from "{baseDir}/scripts/travel_db.mjs";

const summary = getBudgetSummary(tripId);
```

### Step 11: Post-Trip Updates

After the trip:

```javascript
import { moveTripToPast, addPreviousDestination } from "{baseDir}/scripts/travel_db.mjs";

moveTripToPast(tripId);
addPreviousDestination("Barcelona, Spain");
```

Also update preferences if you learned anything durable:

- preferred hotel style
- realistic pace
- dislike of hotel switching
- stronger interest in food / museums / hiking / photography

## Destination Research Checklist

Use deep destination research after route framing or when the user asks for booking-ready detail.

Research:

1. Entry requirements
2. Best time to visit
3. Safety information
4. Cultural norms
5. Local transportation
6. Top attractions and booking friction
7. Food and restaurant patterns
8. Best neighborhoods to stay in
9. Day trip options
10. Practical travel information

Suggested search topics:

- "[Destination] visa requirements for [nationality]"
- "[Destination] weather in [month]"
- "[Destination] scams to avoid"
- "[Destination] where to stay neighborhoods"
- "[Destination] transportation guide"
- "[Destination] top attractions booking"
- "[Destination] 7-day route"

## Best Practices

1. **Do route framing first for complex destinations**.
2. **Use the fewest questions possible** to unlock a meaningful recommendation.
3. **Front-load the big decisions**: route, transport, hotel zone.
4. **Treat arrival and departure days as lighter by default**.
5. **Build 20-30% slack into each day**.
6. **Use real transport and hotel data before sounding definitive**.
7. **Give one recommended route and one backup**, not five equal options.
8. **Prefer execution-ready day cards over attraction dumping**.

## Example Interaction

```
User: "Help me plan a 7-day trip to Xinjiang"

Assistant: [Checks preferences, creates lightweight trip record]

Before I map daily stops, I want to frame the right version of Xinjiang for you.
Just a few things that change the route a lot:
1. Roughly which month are you going?
2. Which city are you flying from?
3. Budget per person or total?
4. More interested in scenery, photography, culture, or food?
5. Are you okay with self-driving, or would you rather avoid it?

User: "Mid-July, flying from Shanghai, two people, around 7,000 RMB each, mostly scenery, don't want to self-drive."

Assistant: [Runs route framing, then light validation]

Best fit: North Xinjiang Yili soft route.
Why: it gives you stronger scenery density within 7 days, avoids forcing both Yili and Kanas, and is more comfortable without self-driving.

Backup option: Kanas scenic line.
Why not first: more transfer-heavy and more tiring for a first Xinjiang trip at this pace.

Suggested transport:
- Fly into Urumqi
- Use a local driver / small-group route for the core days
- Keep hotel changes to 3 bases max

If this direction feels right, I'll turn it into a booking-ready 7-day plan with hotel strategy, transport chain, and daily execution cards.
```

## Notes

- Preferences and trips JSON: `~/.openclaw/agents/travel-planner/preferences.json`, `~/.openclaw/agents/travel-planner/trips.json`
- CLI: `node {baseDir}/scripts/<script>.mjs`

```bash
node {baseDir}/scripts/travel_db.mjs is_initialized
node {baseDir}/scripts/travel_db.mjs add_trip '<json>' current
node {baseDir}/scripts/travel_db.mjs get_preferences
node {baseDir}/scripts/travel_db.mjs get_trips current
node {baseDir}/scripts/travel_db.mjs stats
node {baseDir}/scripts/plan_generator.mjs --trip-id <id> --output plan.json
node {baseDir}/scripts/travel_db.mjs export > backup.json
```

## Resources

### scripts/travel_db.mjs

Database management for preferences, trips, budget tracking, itineraries, and travel statistics.

### scripts/plan_generator.mjs

Generates route framing, live-validation-aware plan skeletons, itineraries, budget breakdowns, packing checklists, and preparation timelines.

### scripts/live_validation.mjs

Builds the booking-oriented validation package that tells the agent what live tool calls to run before producing a booking-ready answer.

### scripts/route_selector.mjs

Scores route candidates for complex destinations before the detailed itinerary is written.

### scripts/booking_ready.mjs

Turns attached live search outputs into a booking-ready decision package with transport options, hotel candidates, anchor POIs, and booking watchouts.

### scripts/briefing.mjs

Generates manual pre-trip and in-trip brief payloads that can later be wired into cron or other reminder delivery systems.

### references/travel_guidelines.md

Comprehensive guide for destination research, budget planning, itinerary creation, packing strategies, and safety tips.

### references/cultural_etiquette.md

Templates and guidelines for researching country-specific customs, dress codes, dining etiquette, religious considerations, and common mistakes to avoid.
