---
name: travel-planner
description: 'Plans multi-day trips with route framing, live flight/hotel checks, and booking-ready output. Use when users ask for itineraries, routing, hotel and flight strategy, budgets, packing, pre-trip briefs, or in-trip changes. Typical prompts: plan a trip, 7-day itinerary, route framing for broad regions, booking-ready logistics, destination comparison. Do not use for weather-only single facts, generic coding, or creative writing without logistics. Near booking: coordinate flyai (flights, hotels, POI), 12306 (China rail), amap-lbs-skill (China maps/routing).'
license: MIT
compatibility: Node.js for bundled CLI scripts; network for live checks. Optional skills flyai, 12306, amap-lbs-skill for booking-stage validation. Default DB paths ~/.openclaw/agents/travel-planner/.
metadata:
  openclaw:
    emoji: ✈️
    requires:
      bins:
        - node
---

# Travel Planner

## `{baseDir}` (skill root)

In instructions below, `{baseDir}` is the absolute path to this skill folder (the directory that contains `SKILL.md` and `scripts/`). Your host replaces it when running commands; humans should substitute the real path. All runnable examples use `node {baseDir}/scripts/....mjs` with `--key=value` flags.

**Programmatic use:** When the OpenClaw runtime loads `skills/travel-planner/index.js`, use normal imports from that package root (for example `import { savePreferences } from "./skills/travel-planner/scripts/travel_db.mjs"` from repo code). Do not paste `{baseDir}` inside real import paths.

## When to use

- Multi-day planning, route choice, booking-oriented logistics
- Budget, packing, etiquette pointers tied to a real trip
- Pre-trip / in-trip briefs and course correction

## When not to use

- One-off weather or trivia with no itinerary or logistics
- Non-travel technical work
- Pure fiction or creative writing with no travel decisions

## If partner skills or live checks fail

`live_validation.mjs` only **plans** tool calls; it does not fix outages.

1. State clearly which checks could not run (flyai, 12306, amap-lbs-skill, or web).
2. Keep route framing and skeleton advice; label pricing, availability, and timings as **unverified**.
3. Do not claim booking-ready validation if `booking_ready` inputs are missing or partial; list what the user must verify manually.
4. Prefer CLI persistence (`travel_db.mjs`) when you still have partial JSON to save for later.

## Overview

This skill should act like a travel decision assistant first and a long-form itinerary writer second.
Its job is not to dump a giant travel guide immediately. Its job is to:

1. understand the traveler,
2. choose the right route or trip shape,
3. validate the big decisions with live data,
4. produce an execution-ready plan,
5. support the traveler before and during the trip.

Deep research checklists, budget frameworks, and pacing tables live in **`references/travel_guidelines.md`**. Country-level etiquette templates are in **`references/cultural_etiquette.md`**—open them when building booking-ready or safety-heavy answers.

## Core Principles

- Route choice matters more than adding one more attraction.
- Do not ask a giant questionnaire up front. Ask the fewest questions that meaningfully change the recommendation.
- Put transport and hotel strategy in the main answer once the user is moving toward booking.
- Arrival day and departure day should be intentionally lighter.
- Prefer one anchor activity plus one nearby secondary option over overloaded schedules.
- Treat weather, transfer friction, and energy as real constraints.
- For complex regions, **do route framing first**, then validate; see workflow Step 4–5.

## Workflow

### Step 1: Load Preferences

Check whether travel preferences already exist:

```bash
node {baseDir}/scripts/travel_db.mjs --cmd=is_initialized
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

Save only what the user actually provides (flags use `--key=value`; JSON may be `@file`):

```bash
node {baseDir}/scripts/travel_db.mjs --cmd=save_preferences --payload='{"departure_city":"Shanghai","budget_level":"mid-range","pace_preference":"moderate","travel_companions":"couple","interests":["nature","food","photography"],"transport_preferences":["private driver","short flight okay"],"walking_tolerance":"moderate"}'
```

### Step 3: Create a Trip Record Early

As soon as the user is planning a concrete trip, create a structured trip record even if some fields are still unknown.

Capture: destination text or region; dates or flexibility; duration; budget; travelers; interests; constraints; must-do items.

```bash
node {baseDir}/scripts/travel_db.mjs --cmd=add_trip --payload='{"destination_text":"Xinjiang","destination":{"region":"Xinjiang","country":"China"},"duration_days":7,"budget":{"total":14000,"currency":"CNY"},"travelers":2,"activities":["nature","photography"],"must_do":[],"constraints":["does not want to self-drive"],"transport_preferences":["private driver","short domestic flight okay"],"stage":"intake"}' --list=current
```

The command prints `trip_id`; use it in later `--trip-id=` calls.

### Step 4: Route Framing Before Full Research (Xiaohongshu-first)

**Who produces the route?** The **agent** (you). For domestic planning defaults, use **Xiaohongshu-first**:

1. Build route evidence by calling the independent `xiaohongshu` skill (`search-feeds` + optional `get-feed-detail`).
2. Normalize results into `trip.xhs_evidence` (popular loops, popular stops, risk hints, recommended bases, evidence links).
3. Use that evidence to generate 1 primary route + 1 backup route.
4. If Xiaohongshu is unavailable or low-signal, downgrade to model fallback and set `source_reason`.

The script `route_selector.mjs` returns a structured route-framing package (not day-by-day cards), including:

- `recommended_route` (with `route_id`)
- `alternatives`
- `route_options` (2-3 options for user choice)
- `comparison` (tradeoffs for each option)
- `recommendation_source` / `source_reason`
- `requires_xhs_evidence` / `next_action`

For complex destinations, do **route framing** before a full day-by-day itinerary. This is a separate stage from deep destination research.

Use route framing when the destination is broad or multi-region (e.g. large provinces, multi-city countries, multi-country trips).

In this stage, **you** answer from live-capable tools and reasoning:

- Which route family fits best?
- What should the transport style be?
- How many hotel bases should there be?
- Which popular alternative is weaker for this traveler?

Run route framing helper after evidence is ready:

```bash
node {baseDir}/scripts/route_selector.mjs --input='<trip_request_json_with_xhs_evidence>'
```

Recommended Xiaohongshu search optimization for route framing:

- Prefer query pattern: `J人<destination><days>天行程安排` (example: `J人川西5天行程安排`)
- Force filters: `--note-type 图文 --sort-by 最多点赞`
- Exclude video notes from evidence candidates
- Keep only top 2-3 high-like posts as route evidence

You can normalize with:

```bash
node {baseDir}/scripts/xhs_evidence_builder.mjs --input='<{"destination_text":"川西","duration_days":5,"search_results":[...]}>'
```

Or programmatically:

```javascript
travel_planner({ mode: "build_xhs_evidence", destination_text: "川西", duration_days: 5, search_results });
```

**Programmatic:** `selectRouteCandidates(trip)` returns route-framing output with:

- `recommended_route`
- `alternatives`
- `route_options`
- `comparison`
- `recommendation_source` (`xhs_first` / `model_fallback` / `model_only`)
- `requires_xhs_evidence`
- `next_action`

If `recommendation_source_policy` is `xhs_first` and evidence is insufficient, the helper returns fallback metadata plus `requires_xhs_evidence=true`.

### Mandatory sequencing (do not skip)

1. Collect Xiaohongshu evidence first.
2. Persist evidence:

```javascript
travel_planner({ mode: "persist_xhs_evidence", tripId, xhsEvidence });
```

3. Run route framing from the trip that now includes `xhs_evidence`.
4. Persist route framing:

```javascript
travel_planner({ mode: "persist_route_framing", tripId, trip });
```

5. Present `route_options` and ask user to pick one `route_id` (do not auto-lock silently).
6. Persist user choice:

```javascript
travel_planner({ mode: "confirm_route_choice", tripId, routeId });
```

Do **not** present a final route recommendation before step 1 unless the user explicitly opts into `model_only`.

### Hard guardrail (must enforce)

When `recommendation_source_policy` is `xhs_first`:

- You MUST run Xiaohongshu retrieval first (`xiaohongshu` skill flow or equivalent script call) and persist `xhs_evidence`.
- If Xiaohongshu retrieval cannot run (tool unavailable / login required / runtime error), you MUST NOT present a finalized route recommendation.
- In that case, return only:
  1. what failed,
  2. what user action is needed (e.g. login / enable skill),
  3. optional temporary `model_fallback` route **only if user explicitly accepts fallback**.

Never silently skip Xiaohongshu and output a final route as if XHS-first had succeeded.

#### Route Framing Output Rules

At this stage, reply with:

- 2-3 route options with explicit `route_id`
- a one-line tradeoff per option (time cost / logistics pressure / scenery payoff)
- your recommended option
- why the recommendation fits this traveler
- why a common alternative is less suitable
- a short lodging strategy
- a short transport strategy
- 3-5 clickable Xiaohongshu evidence links (when available)
- a direct confirmation question that asks the user to choose one `route_id`

### Xiaohongshu links in final response

When route framing uses Xiaohongshu evidence, always include a section like:

`参考小红书攻略（可点击查看）`

- `[帖子标题A](https://www.xiaohongshu.com/...)`
- `[帖子标题B](https://www.xiaohongshu.com/...)`
- `[帖子标题C](https://www.xiaohongshu.com/...)`

Rules:

- Prefer links from `route_framing.evidence_links` and `xhs_evidence.sources`.
- Keep only accessible note links (no placeholders).
- If no valid links exist, explicitly state: `本次未拿到可分享的小红书链接，请先登录或重试检索。`

Persist route framing and source metadata before Step 5:

- `selected_route`
- `route_framing.alternatives`
- `recommendation_source_policy` (`xhs_first` default, `model_only` opt-out)
- `recommendation_source_runtime` (`xhs_first` / `model_fallback` / `model_only`)
- `source_reason` (`xhs_login_required` / `xhs_low_signal` / `xhs_runtime_error` / `model_only`)
- `xhs_evidence`
- `route_options`
- `route_choice_confirmed` (must remain `false` before user picks)
- `chosen_route_id` (must be empty before user picks)

`live_validation.mjs` needs the structured route object (`hotel_bases`, `poi_cities`, `regions`, etc.).

Do **not** write a full 7-day itinerary yet unless the user explicitly confirms one route option.

### Step 5: Light Research and Validation

After route framing, do light validation before expanding the plan.

**Order (do not skip step 1):**

1. Ensure route choice is confirmed first (`route_choice_confirmed=true` and `chosen_route_id` exists).
2. Run `live_validation.mjs` once with the current trip JSON, the **selected route** object from Step 4, and preferences (from `get_preferences` or `{}`). This produces the `tool_plan` you must follow.
3. Run the checks it lists (`flyai`, `12306`, `amap-lbs-skill`, etc.). Do **not** jump straight to ad hoc `flyai` calls before step 2, except quick web research (weather, closures).
4. When you have raw tool outputs, pass them through `booking_ready.mjs` (or `index.js` `booking_ready` / `auto_validate` mode) before presenting a booking-ready answer.

Validate:

1. Season and weather fit
2. Big transport feasibility
3. Hotel zone strategy
4. Whether budget and pace are realistic
5. Any major safety or closure issues
6. Whether the route can be promoted into a booking-ready plan

Use `live_validation.mjs` to generate the actual validation package:

```bash
node {baseDir}/scripts/live_validation.mjs --trip='<trip_json>' --route='<route_json>' --preferences='<prefs_json>'
```

This script does not execute live tools. It tells you:

- which `flyai search-flight` calls to run,
- which `flyai search-hotel` calls to run,
- which `flyai search-poi` checks to run,
- when to involve `12306` or `amap-lbs-skill`,
- which decision gates must be satisfied before you present booking-ready output.

Use the `travel-planner` runtime entrypoint in `auto_validate` mode to:

- generate the live validation plan,
- synthesize a booking draft from currently available results,
- surface explicit next-step choices to the user.

Important default behavior:

- `auto_validate` now defaults to plan-only mode (`execute=false`).
- In default mode it returns validation plan + booking draft and asks for user choice:
  1. `制定详细计划（快速）`
  2. `先验证交通酒店和景点（推荐）`
- `auto_validate` should not run external checks from inside runtime; agent should call related skills explicitly.

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

At this stage you should ask for explicit user confirmation again:

- confirm the selected route is final,
- confirm booking strategy (transport + hotel),
- confirm whether to proceed to full day-by-day output.

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
node {baseDir}/scripts/plan_generator.mjs --trip-id=<id>
```

Use these sections before presenting the detailed itinerary:

- `route_framing`
- `live_validation`
- `plan_skeleton`
- `booking_strategy`

### Step 8: Generate the Detailed Plan

Only after route framing is accepted **and the main validation gates are cleared** should you generate the detailed plan.

Hard gate for itinerary generation:

- `route_choice_confirmed === true`
- `selected_route` is present (from `confirm_route_choice`)
- `booking_ready.status === "ready"` (or user explicitly accepts a non-ready draft)

For a single structured JSON object (itinerary, budget, packing, etc.), prefer `plan_generator.mjs --trip-json=...` or the skill runtime `index.js` with `mode: "trip_plan"` once `trip` includes confirmed route state (`route_choice_confirmed=true`, `selected_route`) and any `live_results` you have.

If you already have live tool results for flights, hotels, or attractions, synthesize them into a booking-ready package before presenting the final recommendation:

```bash
node {baseDir}/scripts/booking_ready.mjs --trip='<trip_json>' --route='<route_json>' --validation='<live_validation_json>' --results='<live_results_json>'
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
node {baseDir}/scripts/travel_db.mjs --cmd=save_live_results --trip-id=<trip_id> --payload='<live_results_json>'
node {baseDir}/scripts/travel_db.mjs --cmd=save_booking_ready --trip-id=<trip_id> --payload='<booking_ready_json>'
node {baseDir}/scripts/travel_db.mjs --cmd=patch_trip --trip-id=<trip_id> --payload='<partial_json>'
# `update_trip` is an alias of `patch_trip` (merge fields such as stage, selected_route).
node {baseDir}/scripts/travel_db.mjs --cmd=confirm_booking --trip-id=<trip_id> --category=hotel --payload='<selected_hotel_json>'
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
node {baseDir}/scripts/briefing.mjs --mode=pre_trip --trip='<trip_json>' --plan='<plan_json>'
node {baseDir}/scripts/briefing.mjs --mode=daily --trip='<trip_json>' --plan='<plan_json>' --day=2
```

If the user has already departed, mark the trip as active first:

```bash
node {baseDir}/scripts/travel_db.mjs --cmd=start_trip --trip-id=<trip_id>
```

For now, brief generation may be manual or invoked by other workflow layers. A cron scheduler can be added later without changing the briefing format.

**Expenses and budget (programmatic only — no `travel_db` CLI):** use exports from `index.js` / `travel_db.mjs`, for example `addExpense(tripId, { category, amount, description, date })` and `getBudgetSummary(tripId)`.

### Step 11: Post-Trip Updates

**Programmatic:** `moveTripToPast(tripId)` and `addPreviousDestination("City, Country")` from the same module surface as Step 10; merge durable preference updates via `updatePreference` / `savePreferences` as appropriate.

Also update preferences if you learned anything durable:

- preferred hotel style
- realistic pace
- dislike of hotel switching
- stronger interest in food / museums / hiking / photography

## Example dialogue

Full sample transcript (Xinjiang, route framing first): **`references/example_dialogue.md`**.  
After frontmatter changes, run through **`references/trigger_regression.md`** once by hand.

## Notes

- Preferences and trips JSON: `~/.openclaw/agents/travel-planner/preferences.json`, `~/.openclaw/agents/travel-planner/trips.json`
- CLI: `node {baseDir}/scripts/<script>.mjs` (all scripts use `--key=value`; see each `--help`).

```bash
node {baseDir}/scripts/travel_db.mjs --cmd=is_initialized
node {baseDir}/scripts/travel_db.mjs --cmd=add_trip --payload='<json>' --list=current
node {baseDir}/scripts/travel_db.mjs --cmd=get_preferences
node {baseDir}/scripts/travel_db.mjs --cmd=get_trips --status=current
node {baseDir}/scripts/travel_db.mjs --cmd=stats
node {baseDir}/scripts/plan_generator.mjs --trip-id=<id> --output=plan.json
node {baseDir}/scripts/travel_db.mjs --cmd=export
```

## Resources (scripts and references)

| Path | Role |
|------|------|
| `scripts/travel_db.mjs` | Preferences, trips, budget summary data, export |
| `scripts/plan_generator.mjs` | Route framing, skeletons, itineraries, packing |
| `scripts/live_validation.mjs` | Tool plan and gates (does not call live APIs) |
| `scripts/route_selector.mjs` | Destination tag + note only (no built-in routes) |
| `scripts/booking_ready.mjs` | Merge live results into booking-ready package |
| `scripts/briefing.mjs` | Pre-trip and daily brief payloads |
| `references/travel_guidelines.md` | Research checklist, budget framework, pacing |
| `references/cultural_etiquette.md` | Country etiquette templates |
| `references/example_dialogue.md` | Worked example: intake, route framing, backup route |
| `references/trigger_regression.md` | Should / should-not trigger checks for description edits |
