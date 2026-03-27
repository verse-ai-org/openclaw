# Design System Specification: High-End Editorial Wizard



## 1. Overview & Creative North Star: "The Digital Concierge"

The Creative North Star for this design system is **The Digital Concierge**. We are moving away from the utilitarian "step-by-step" wizard and toward a premium, guided experience that feels like flipping through a high-end editorial magazine.



This system breaks the "template" look by prioritizing **intentional white space** and **asymmetric focal points**. We reject the rigid, boxed-in grids of standard enterprise software. Instead, we use a centered, breathable layout where content "floats" on a sea of soft neutrals. The goal is to make the user feel like they are not completing a task, but rather "unboxing" a premium service.



## 2. Colors & Surface Logic

The palette is rooted in a high-contrast relationship between a vibrant, energetic primary and a sophisticated, multi-tonal neutral base.



### The Color Palette (Material Tokens)

* **Primary (`#ba0034`):** Our "Vibrant Red" heartbeat. Used for high-intent actions.

* **Surface (`#f9f9fb`):** The "Soft Gray" base. It provides a cool, clean canvas.

* **Surface Container Lowest (`#ffffff`):** Our "Crisp White." Reserved for the primary content cards to create maximum pop.

* **Tertiary (`#00694b`):** A sophisticated deep teal for success states and secondary accents, providing a professional counterbalance to the red.



### The "No-Line" Rule

**Strict Mandate:** Designers are prohibited from using 1px solid borders for sectioning or containment.

Boundaries must be defined solely through background color shifts. For example, a `surface-container-low` section sitting on a `surface` background provides all the separation a premium UI needs. If you feel the need for a line, you haven't used your spacing or tonal shifts effectively.



### Surface Hierarchy & Nesting

Treat the UI as a series of physical layers—like stacked sheets of frosted glass.

1. **Level 0 (Base):** `surface` (#f9f9fb)

2. **Level 1 (Sectioning):** `surface-container-low` (#f3f3f5)

3. **Level 2 (Active Cards):** `surface-container-lowest` (#ffffff)

4. **Level 3 (Overlays/Modals):** Glassmorphic containers using `surface` at 70% opacity with a 20px backdrop-blur.



### The "Glass & Gradient" Rule

To avoid a flat "out-of-the-box" feel, primary CTAs should utilize a subtle linear gradient from `primary` (#ba0034) to `primary-container` (#e51245). This adds a "soul" to the button, suggesting depth and tactile quality.



## 3. Typography: Editorial Authority

We utilize a single sans-serif family (**Inter**) but manipulate the scale to create a "Big Type" editorial feel.



* **Display-LG (3.5rem):** Used for "Welcome" moments. Tracking should be set to -0.02em for a tighter, premium lockup.

* **Headline-LG (2rem):** The workhorse for wizard step titles. Use Semi-Bold weight to assert authority.

* **Body-LG (1rem):** High-clarity reading text. Use a generous line-height (1.6) to ensure the "breathable" feel remains consistent even in dense text.

* **Label-MD (0.75rem):** Uppercase with 0.05em letter spacing for small metadata or overlines.



## 4. Elevation & Depth

In this system, depth is a feeling, not a drop-shadow effect.



* **The Layering Principle:** Achieve lift by stacking `surface-container-lowest` cards on `surface-container-low` backgrounds. This "Tonal Layering" creates a soft, natural lift.

* **Ambient Shadows:** When a card must float (e.g., during a transition), use an extra-diffused shadow: `offset-y: 20px`, `blur: 40px`, `color: rgba(26, 28, 29, 0.06)`. Note the use of the `on-surface` color (#1a1c1d) at very low opacity to mimic natural light.

* **The "Ghost Border" Fallback:** If accessibility requires a container boundary, use `outline-variant` at 15% opacity. Never use 100% opaque borders.



## 5. Signature Components



### Primary Buttons

* **Radius:** `full` (9999px) for a friendly, modern feel.

* **Color:** Gradient of `primary` to `primary-container`.

* **Padding:** `spacing-4` (vertical) and `spacing-8` (horizontal).

* **Interaction:** On hover, the button should scale to 102% and increase shadow diffusion.



### Content Cards

* **Radius:** `xl` (3rem/48px) for outer containers; `lg` (2rem/32px) for inner nested cards.

* **Background:** `surface-container-lowest` (#ffffff).

* **Spacing:** Internal padding must never be less than `spacing-8` (2.75rem).



### Wizard Navigation (Fixed Footer)

* **Visual Style:** A glassmorphic bar (`surface` at 80% opacity, 30px blur) fixed to the bottom.

* **Content:** Centered primary action, with "Back" as a `body-md` text button on the left to maintain visual asymmetry.



### Input Fields

* **Style:** Minimalist. No bottom line, no box. Instead, use a `surface-container-high` background with a `md` (1.5rem) border radius.

* **Focus State:** A 2px "Ghost Border" using the `primary` color at 40% opacity.



## 6. Do’s and Don’ts



### Do

* **Do** use asymmetrical margins. If a header is centered, perhaps the descriptive text is slightly narrower to create a sophisticated silhouette.

* **Do** use `spacing-20` or `spacing-24` between major sections to let the design "breathe."

* **Do** use transitions. Elements should slide vertically (y-axis) with a "spring" easing when moving between wizard steps.



### Don't

* **Don't** use dividers. If you need to separate two items, use a `spacing-4` gap or a subtle background shift.

* **Don't** use pure black (#000000) for text. Use `on-surface` (#1a1c1d) to maintain the premium, soft-gray aesthetic.

* **Don't** crowd the card. If the content doesn't fit with a `spacing-8` padding, the wizard step should be split into two.
