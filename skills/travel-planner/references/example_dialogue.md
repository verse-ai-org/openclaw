# Example: Xinjiang 7-day planning dialogue

Illustrates **route framing before** day-by-day detail (Workflow Step 4–5), minimal intake questions, and one recommended route plus one backup. The assistant’s route narrative is **agent-produced** (research + tools such as flyai/amap)—`route_selector.mjs` does not inject fixed itineraries.

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
