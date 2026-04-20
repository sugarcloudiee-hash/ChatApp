---
name: good-ui
description: 'Design and implement high-quality, intentional frontend UI. Use when asked for good UI, better UX, visual polish, redesigns, responsive layouts, animation polish, or modernizing web app appearance.'
argument-hint: 'Page or component to design, plus visual direction and constraints'
user-invocable: true
disable-model-invocation: false
---

# Good UI Workflow

Create interface updates that are intentional, distinctive, usable, and production-ready.

## When to Use
- Requests like: good ui, improve ui, redesign this page, make it look modern, polish frontend, better ux
- New page/component creation where visual quality matters
- Existing UI refreshes that need stronger hierarchy, spacing, typography, and motion
- Responsive and accessibility improvements for current layouts

## Inputs to Collect
- Target surface: which page(s) or component(s)
- Product style constraints: existing design system to preserve or greenfield direction
- Brand constraints: colors, fonts, tone
- Functional constraints: data density, interactivity, required states
- Technical constraints: framework, CSS approach, browser targets
- Default when unspecified: clean product UI (clarity-first)

## Procedure
1. Establish intent and constraints.
   - Confirm the user-facing goal for the surface.
   - Determine whether to preserve current patterns or introduce a new direction.

2. Choose a visual direction.
   - Define 1 clear concept (editorial, minimal, data-dense, playful, etc.).
   - Set design tokens early: color palette, typography stack, spacing scale, radius, shadow, motion duration.

3. Build hierarchy before decoration.
   - Design information architecture first: primary action, secondary action, scannable sections.
   - Use strong typography and spacing rhythm before adding effects.

4. Implement responsive structure.
   - Start with mobile-safe layout behavior and scale up to desktop.
   - Ensure grids, cards, and controls adapt cleanly at common breakpoints.

5. Add meaningful motion and depth.
   - Use a small set of purposeful animations (entry reveal, hover emphasis, section transitions).
   - Avoid excessive animation and avoid motion that competes with task completion.

6. Ensure accessibility and robustness.
   - Verify contrast, focus visibility, keyboard navigation, and semantic structure.
   - Provide empty/loading/error states where relevant.

7. Validate and refine.
   - Check visual consistency across components.
   - Remove generic boilerplate patterns that do not serve the chosen direction.

## Decision Points
- Existing design system present?
  - Yes: preserve core tokens/components and improve layout/composition only.
  - No: define explicit tokens in CSS variables and apply consistently.

- Surface type?
  - Marketing/landing: prioritize storytelling, hero hierarchy, and visual personality.
  - Product/dashboard: prioritize clarity, scanning speed, and interaction affordances.

- Motion sensitivity or perf concerns?
  - High sensitivity/low-power targets: reduce motion, shorten durations, prefer subtle transitions.
  - Otherwise: keep 2-4 animation patterns and use them consistently.

- Data density?
  - Dense data: tighter spacing scale, stronger table/list affordances, compact components.
  - Light content: larger spacing, larger type contrast, stronger visual atmosphere.

## Quality Checks (Done Criteria)
- A clear visual direction is visible and consistent.
- Typography uses intentional pairings (not default browser/system fallback only).
- Color and spacing tokens are defined and reused.
- Layout works on mobile and desktop without overlap or clipped content.
- Primary actions are obvious in under 3 seconds of scanning.
- Contrast and focus states are accessible.
- Empty/loading/error states exist where needed.
- No obvious console errors caused by UI changes.

## Output Format
- Implemented UI changes in relevant frontend files
- Brief rationale covering: direction, key layout choices, responsiveness, and accessibility
- Optional follow-up variants if user asks for alternatives

## Example Prompts
- /good-ui Improve the dashboard in src/App.jsx to look premium and readable on mobile.
- /good-ui Redesign the landing page with an editorial style and subtle motion.
- /good-ui Polish form controls and card components while preserving current brand colors.
