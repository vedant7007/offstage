# Design tokens

The look of Sutradhar, design system "Backstage": paper and ink, a blue-dark brand accent, lime for the moments that matter, mono labels and pill buttons. Calm, precise, confident.

- Source of truth: `src/styles/tokens.css`. Tailwind mapping: `src/styles/theme.css`. Tailwind entry: `src/app/globals.css` (the file `components.json` points at), which also keeps the shadcn variables (`--background`, `--primary`, `--chart-*`, `--sidebar-*`, `--radius`) pointed at our tokens.
- Review page: `/design` (only when `DEMO_MODE=true`). Every primitive and composite, both themes, and a real 360 px frame.
- Contrast check: `pnpm contrast` reads the hex values from `tokens.css` and fails on any pairing below WCAG 2.2 AA. `pnpm contrast --write` refreshes the table below. Change a colour, run it, commit both.

## Themes

| Theme | Class | Feel |
| --- | --- | --- |
| Paper (light) | `.light` (default) | Cool grey-blue paper, black ink text, blue-dark accent |
| Ink (dark) | `.dark` | True black ink, paper text, lime accent |

The theme follows the device setting until someone uses the toggle. Components never use `dark:` for colour; the tokens switch instead, so a `.light` panel inside a dark page (or the reverse) renders correctly.

## Colour roles

Each role follows one naming pattern:

| Suffix | Use |
| --- | --- |
| `--<role>` | Solid fill, icon or border |
| `--on-<role>` | Text on the solid fill |
| `--<role>-text` | Text in that role on `--bg` or `--surface` |
| `--<role>-soft` | Tinted background |
| `--<role>-soft-fg` | Text on the tinted background |

| Role | Meaning | Light | Dark |
| --- | --- | --- | --- |
| `bg` | Page background | `#e4e6ef` | `#000000` |
| `surface` | Cards, inputs | `#f0f1fa` | `#0e0f14` |
| `surface-raised` | Dialogs, menus, toasts | `#ffffff` | `#16171d` |
| `surface-sunken` | Hover, table header, wells | `#d9dce8` | `#07080b` |
| `border` | Decorative 1 px lines | `#c9ccda` | `#2a2d38` |
| `border-strong` | Control outlines (must be seen) | `#6b7085` | `#6b7085` |
| `fg` / `fg-muted` | Text / secondary text | `#000000` / `#4a4f63` | `#e4e6ef` / `#9aa0b4` |
| `ring` | Focus outline | `#071bdf` | `#c1ff00` |
| `curtain` | The one brand accent. Primary buttons, selection, active tab. Blue-dark with white text in light, lime with black text in dark | `#071bdf` | `#c1ff00` |
| `agent` | Anything an agent did or is doing (purple) | `#8832f7` (text `#6a1fd0`) | `#b47cff` |
| `approved` | Approved, reversible. Lime is a fill only in light mode | `#3e4c00` (soft `#c1ff00`) | `#c1ff00` |
| `pending` | Waiting, warning (gold) | `#7a5a00` (soft `#ffe45e`) | `#ffe45e` |
| `info` | Information, executed | `#1a2ffb` (text `#071bdf`) | `#8a95ff` |
| `neutral` | Rejected, stale, undone, expired | `#6b7085` | `#7a7f93` |
| `danger` | Destructive actions, errors | `#e90000` (text `#b80000`) | `#ff4c41` |
| `emergency` | Emergencies only | `#e90000` | `#e90000` |

Base palette: paper `#E4E6EF`, paper-2 `#F0F1FA`, white, ink `#000`, blue-dark `#071BDF`, blue `#1A2FFB`, purple `#8832F7`, error `#E90000`, red `#FF4C41`, lime `#C1FF00`, gold `#FFE45E`. Text selection is lime with black text in both themes.

### Contrast pitfalls

- Lime `#C1FF00` is never text, a border or a ring in light mode (1.04:1 on paper). It is only a fill behind black text.
- Blue-dark `#071BDF` is never text on ink (2.2:1). In dark mode the primary turns lime and links and info use `#8A95FF`.
- Error red `#E90000` is for borders, icons and fills in light mode. Small error text uses `#B80000`.
- Purple `#8832F7` on paper is 4.38:1, so purple text uses `#6A1FD0`.
- Red `#FF4C41` and gold `#FFE45E` are text colours in dark mode only.

shadcn names (`background`, `primary`, `muted-foreground`, `destructive` and so on) are mapped onto these, so components added later with the shadcn CLI pick up the palette. Tailwind's default palette is switched off: `bg-red-500` does not exist, on purpose.

## Contrast ratios

Text needs 4.5:1. Icons, control borders and the focus ring need 3:1 (WCAG 1.4.11).

<!-- contrast:begin -->
| Pair | Used for | Needs | Light | Dark |
| --- | --- | --- | --- | --- |
| `--fg` on `--bg` | Body text | 4.5:1 | 16.86 pass | 16.86 pass |
| `--fg` on `--surface` | Body text | 4.5:1 | 18.67 pass | 15.37 pass |
| `--fg` on `--surface-raised` | Body text | 4.5:1 | 21.00 pass | 14.36 pass |
| `--fg` on `--surface-sunken` | Body text | 4.5:1 | 15.35 pass | 16.08 pass |
| `--fg-muted` on `--bg` | Secondary text | 4.5:1 | 6.51 pass | 8.06 pass |
| `--fg-muted` on `--surface` | Secondary text | 4.5:1 | 7.21 pass | 7.35 pass |
| `--fg-muted` on `--surface-raised` | Secondary text | 4.5:1 | 8.11 pass | 6.86 pass |
| `--fg-muted` on `--surface-sunken` | Secondary text | 4.5:1 | 5.93 pass | 7.69 pass |
| `--border-strong` on `--bg` | Control borders | 3:1 | 3.94 pass | 4.28 pass |
| `--border-strong` on `--surface` | Control borders | 3:1 | 4.36 pass | 3.90 pass |
| `--ring` on `--bg` | Focus ring | 3:1 | 7.56 pass | 17.57 pass |
| `--ring` on `--surface` | Focus ring | 3:1 | 8.37 pass | 16.02 pass |
| `--ring` on `--surface-sunken` | Focus ring | 3:1 | 6.88 pass | 16.76 pass |
| `--on-curtain` on `--curtain` | Primary button | 4.5:1 | 9.41 pass | 17.57 pass |
| `--on-curtain` on `--curtain-hover` | Primary button hover | 4.5:1 | 7.39 pass | 18.21 pass |
| `--curtain` on `--bg` | Primary button edge | 3:1 | 7.56 pass | 17.57 pass |
| `--curtain-text` on `--bg` | Links, brand text | 4.5:1 | 7.56 pass | 17.57 pass |
| `--curtain-text` on `--surface` | Links, brand text | 4.5:1 | 8.37 pass | 16.02 pass |
| `--curtain-soft-fg` on `--curtain-soft` | Selected chip, tier badge | 4.5:1 | 7.16 pass | 12.65 pass |
| `--on-agent` on `--agent` | Agent avatar | 4.5:1 | 5.46 pass | 7.27 pass |
| `--agent` on `--surface` | Agent icon | 3:1 | 4.85 pass | 6.62 pass |
| `--agent-text` on `--bg` | Agent text | 4.5:1 | 6.20 pass | 7.27 pass |
| `--agent-text` on `--surface` | Agent text | 4.5:1 | 6.86 pass | 6.62 pass |
| `--agent-soft-fg` on `--agent-soft` | Simulated badge | 4.5:1 | 7.36 pass | 8.63 pass |
| `--approved` on `--surface` | Approved icon | 3:1 | 8.34 pass | 16.02 pass |
| `--approved-text` on `--surface` | Approved text | 4.5:1 | 8.34 pass | 16.02 pass |
| `--approved-soft-fg` on `--approved-soft` | Approved badge | 4.5:1 | 17.57 pass | 13.11 pass |
| `--pending` on `--surface` | Pending icon | 3:1 | 5.67 pass | 15.05 pass |
| `--pending-text` on `--surface` | Pending text | 4.5:1 | 6.88 pass | 15.05 pass |
| `--pending-soft-fg` on `--pending-soft` | Pending badge, warning alert | 4.5:1 | 16.51 pass | 11.85 pass |
| `--info` on `--surface` | Info icon | 3:1 | 6.56 pass | 7.13 pass |
| `--info-text` on `--surface` | Info text | 4.5:1 | 8.37 pass | 7.13 pass |
| `--info-soft-fg` on `--info-soft` | Executed badge, info alert | 4.5:1 | 7.16 pass | 9.26 pass |
| `--neutral` on `--surface` | Neutral icon | 3:1 | 4.36 pass | 4.82 pass |
| `--neutral-soft-fg` on `--neutral-soft` | Rejected, stale, undone badges | 4.5:1 | 10.03 pass | 10.40 pass |
| `--danger` on `--surface` | Danger icon, destructive border | 3:1 | 4.18 pass | 5.80 pass |
| `--danger-text` on `--bg` | Error text | 4.5:1 | 5.55 pass | 7.53 pass |
| `--danger-text` on `--surface` | Error text | 4.5:1 | 6.14 pass | 6.86 pass |
| `--danger-soft-fg` on `--danger-soft` | Danger alert | 4.5:1 | 7.88 pass | 8.14 pass |
| `--on-emergency` on `--emergency` | Emergency banner | 4.5:1 | 4.70 pass | 4.70 pass |
| `--emergency` on `--bg` | Emergency border | 3:1 | 3.78 pass | 4.46 pass |
| `--emergency-soft-fg` on `--emergency-soft` | Emergency alert | 4.5:1 | 7.88 pass | 7.81 pass |
<!-- contrast:end -->

## Type

- UI and display: **Inter Tight** (variable, `--font-grotesk`), for everything. `font-sans` and `font-display` both point at it. Body is 400, headings 500 (never 600 or more).
- Mono: **IBM Plex Mono** 400 and 500 (`--font-plex-mono`, Tailwind `font-mono`), for kickers, labels, numbers and tier chips.
- Devanagari falls back to **Noto Sans Devanagari**, loaded only when Devanagari text appears.
- `kicker` utility: mono, 12 px, weight 500, `0.12em` tracking, uppercase. Use it for the small label above a heading.
- Optical tightening: Inter Tight has no `opsz` axis, so every size carries its own tracking. `text-4xl` sets size, line height and letter spacing together; do not add `tracking-*` on top.
- Numbers that change use `tabular-nums`. Large metric numbers (3xl to 5xl) use `tracking-[-0.04em]`.

| Token | Size | Line height | Tracking | Use |
| --- | --- | --- | --- | --- |
| `text-xs` | 12 | 18 | +0.01em | Badges, meta, captions |
| `text-sm` | 14 | 22 | 0 | Hints, secondary text, table cells |
| `text-base` | 16 | 24 | -0.006em | Body, inputs (16 stops iOS zooming into fields) |
| `text-lg` | 18 | 28 | -0.011em | Lede, card titles |
| `text-xl` | 22 | 28 | -0.015em | Section titles |
| `text-2xl` | 28 | 34 | -0.02em | Page title on phones, dialog titles |
| `text-3xl` | 36 | 42 | -0.025em | Page title from md |
| `text-4xl` | 48 | 52 | -0.03em | Public section h2 |
| `text-5xl` | 56 | 60 | -0.035em | Phone hero |
| `text-6xl` | 72 | 74 | -0.04em | Desktop hero |
| `text-7xl` | 96 | 92 | -0.045em | Landing display only |

- Fluid display sizes: `text-hero` (44 px at 390 wide, 72 px from 1440) and `text-section` (36 to 56 px), tracking in em so it scales.
- `text-fade`: a top-to-bottom tone fade, for the hero h1 only. Solid in forced colours.
- Measure: `measure` 65ch for body, `measure-lede` 52ch, `measure-tight` 44ch for empty-state copy. Headings balance (`text-wrap: balance`), paragraphs use `pretty`, from the base layer.
- Hindi: under `:lang(hi)` headings and every `text-*` or `tracking-*` element get `letter-spacing: 0` (negative tracking breaks the shirorekha) and display sizes get `line-height: 1.3` for matras. Hinglish (`hi-Latn`) is untouched.
- No other sizes: `text-[13px]` style values are not allowed.

## Spacing, radius, depth, motion, layers

- Spacing: 4 px base (`p-1` = 4 px, `p-4` = 16 px). Steps: 4, 8, 12, 16, 24, 32, 48, 64, 96, 128. Page gutter 16 px on phones, 32 px from md.
  - Page header: kicker, 12 px, title, 16 px, lede, 32 px, actions. Header to content 48 px (`PageHeader` does this).
  - Sections: `py-16` phones, `py-24` desktop. Section heading to its grid: 32 px phones, 48 px desktop.
  - Cards: `p-5` phones, `p-6` desktop. Grid `gap-4` phones, `gap-6` desktop. Title to body 8 px, body to footer 24 px.
  - Console rows: at least 44 px, cells `py-3 px-4`, toolbar to table 16 px.
- Radius: `rounded-control` 3 px for inputs and alerts. `rounded-card` 18 px for cards. `rounded-inner` 12 px for tiles inside a card (18 minus the 6 px gap). `rounded-sheet` 24 px for dialogs, sheets and the voice panel. Buttons, badges, chips and avatars are pills (`rounded-full` or `rounded-pill`). shadcn's scale (`rounded-sm` to `rounded-4xl`, from `--radius` = 3 px) stays available for CLI-added components.
- Depth comes from light, not boxes: a 1 px inner top highlight (`--highlight`) plus a soft long shadow in `--shadow-ink`. On ink the shadows vanish and the highlight and border carry it.
  - `depth-1` controls and small tiles, `depth-2` cards (`Card` uses it), `depth-3` popovers, menus, dialogs, sheets, tooltips.
  - `shadow-card` is kept for existing code: the same shadow as `depth-2` without the highlight.
  - Hover never animates a shadow. Use `lift` (2 px up, border firms).
- Gradient hairline: `edge` on key cards only (the ticket, a focused approval, the final CTA card, the voice panel), at most three per page. `edge-live` adds a travelling arc of light: one element per page, small.
- Grain: static, inside `shell-backdrop` (and the `grain` utility for a positioned band). Never animated, no blend mode.
- One `backdrop-filter` per screen at most (the scroll-aware site header). Dialog overlays do not blur.
- Motion tokens:
  - Curves: `--ease-out` default UI, `--ease-out-expo` arrivals and reveals, `--ease-in-out` things travelling on screen (indicators, sheets), `--ease-in` exits only.
  - Springs (CSS `linear()`, expo-out fallback): `--spring-snappy` 400 ms for presses and the magnet return, `--spring-soft` 600 ms for panels, toasts, tilt return, `--spring-bouncy` 720 ms for the voice orb and the approve check only. Tailwind: `ease-spring`, `ease-spring-soft`.
  - Durations: `--duration-instant` 100, `fast` 150, `base` 200, `slow` 250, `slower` 400 ms. `--duration-reveal` 600 ms for signature moments only (landing, the public hero, voice). `--stagger` 40 ms, capped at 8 items.
  - Exits are faster than enters (about 150 out, 250 in). Only `transform`, `translate`, `scale`, `rotate` and `opacity` animate: never width, height, `box-shadow`, `backdrop-filter` or large `filter`s.
  - `prefers-reduced-motion: reduce` turns transitions and animations off globally, view transitions run at 0 s, and every pointer effect becomes a no-op.
- Overlays: an ancestor with `transform`, `translate`, `filter`, `will-change: transform` or `contain: paint` traps `position: fixed` children. Every overlay portals to `document.body`, and no `Reveal`, `Tilt` or page transition wrapper ever wraps one.
- Layers: `z-(--z-sticky)` 10, `--z-appbar` 20, `--z-overlay` 40, `--z-modal` 50, `--z-toast` 60, `--z-tooltip` 70.
- Touch targets: every interactive element is at least 44 x 44 px on phones (`min-h-11`). Some tighten to 36 px from md up.

## Usage rules

1. **Status looks come only from `StatusBadge`.** Never colour a state by hand. Every state has an icon and a word, so colour is never the only signal. The vocabulary: `pending`, `approved`, `executed`, `rejected`, `stale`, `undone`, `simulated`, `emergency`, plus `draft`, `executing`, `failed`, `expired` so every proposal status has a look.
2. **Red means emergency.** The only solid red is `--emergency`, always with the stripe pattern, siren icon and uppercase title. Errors and destructive actions use `danger` as text, borders and tints, never a big red fill.
3. **Purple means an agent.** Agent avatars, simulated proposals, citations. The Commander alone wears the curtain accent because it leads the team.
4. **The curtain accent (blue-dark, lime in dark mode) is for the one main action on a screen** (`Button` primary), selection, and the active tab. If everything is accented, nothing is.
5. **Simulations are dashed.** Anything from a what-if run has a dashed purple border and the `simulated` badge, so nobody mistakes it for real state.
6. **Every automated message shows `DraftedByLabel`**: "Drafted by Sutradhar, approved by <role>".
7. **Times go through `TimeRange`** (IST via `src/lib/time.ts`), **money through `MoneyInr`** (Indian grouping via `src/lib/format.ts`). Never format either by hand. Both helpers avoid Intl, so server and browser output match.
8. **No hardcoded strings.** All text comes from `src/lib/i18n/*.json` via `t()`. Counts use `_one` keys for the singular.
9. **Focus is always visible**: 2 px `--ring` outline, 2 px offset, on everything reachable by keyboard.
10. **Tooltips are extras.** Touch screens do not show them, so nothing essential lives only in a tooltip.
11. **Icons** come from lucide-react only, and are `aria-hidden` unless they are the only content (then use `IconButton` with a `label`).

## Components

Import from `@/components/ui`.

| Primitive | Notes |
| --- | --- |
| `Button`, `IconButton` | Variants `primary`, `secondary`, `ghost`, `destructive`, `link`; sizes `sm`, `md`, `lg`; `loading`; `block`. `IconButton` requires `label`. |
| `Field` + `Input`, `Textarea`, `Select` | `Field` wires label, hint, error, required to the control. |
| `Checkbox`, `RadioGroup` + `RadioGroupItem`, `Switch` | Whole row is the click target. |
| `Badge`, `StatusBadge`, `TierBadge`, `Chip`, `InfoChip` | `Chip` is a toggle (`aria-pressed`); `InfoChip` is static. |
| `Card` family, `Section`, `PageHeader`, `KeyValueList`, `Timeline`, `EmptyState` | `Section` needs an `id`; `PageHeader` renders the page's only h1. |
| `Alert` | `info`, `warning`, `danger`, `emergency`. |
| `Dialog` + `DialogContent`, `Sheet` + `SheetContent` | Title required. Sheet is a bottom sheet on phones and a side panel from md. |
| `Toaster`, `toast` | Top centre. Confirmations only. |
| `Tabs` family | Scrolls sideways on narrow screens. |
| `DataTable` | Table from md, cards on phones, from one column list. Server-safe. |
| `Progress`, `Stepper`, `Skeleton`, `Avatar`, `Tooltip` | |
| `AppShell` | Top bar, bottom tabs on phones, sidebar from md, skip link. |
| `ThemeToggle`, `LanguageSwitcher`, `Providers` | `Providers` is mounted once in the root layout. |

| Composite | Notes |
| --- | --- |
| `ProposalCard` | Agent, tier, status, summary, why, evidence, impact, collapsible diff, `actions` slot. |
| `DiffView` | Takes `ActionProposal.diff` as is. Timestamps shown in IST automatically. |
| `ImpactChips` | Takes `ActionProposal.impact` as is. |
| `AgentAvatar` | Any `AgentName`; unknown names get a generic icon. |
| `CitationChip` | Opens the source snippet in a sheet. Snippet is plain text, never HTML. |
| `DraftedByLabel`, `TimeRange`, `MoneyInr` | |

## Premium kit

Motion and depth primitives in `src/components/ui/motion/`, re-exported from `@/components/ui` (or import `@/components/ui/motion` directly). The CSS half lives in `src/styles/motion.css` and the utilities in `theme.css`. `PREMIUM_KIT` (exported) lists every piece with a one-line use, for a showcase.

Restraint is the rule: one focal point per screen and at most two or three signature moments per page. Everything else stays quiet.

### How the pointer effects work

`PointerFx` is mounted once in `Providers`. One delegated `pointermove` listener (mouse only, one rAF per frame, off under reduced motion) writes CSS variables onto whatever is under the cursor:

| Marker | Variables | Effect |
| --- | --- | --- |
| `.spot`, `.spot-edge` or `[data-spot]` | `--mx`, `--my` | Spotlight and lit border follow the cursor |
| `[data-magnetic]` (`data-strength`, `data-max`) | `--tx`, `--ty` | Magnetic pull, spring return |
| `[data-tilt]` (`data-max`) | `--rx`, `--ry`, `--gx`, `--gy` | Pass leans toward the cursor, glare follows |

So these work in server components with no handlers: add the class or attribute.

### Components

| Component | Props | Notes |
| --- | --- | --- |
| `Reveal` | `as?` (`div`, `section`, `article`, `header`, `footer`, `li`, `ul`, `ol`, `p`, `span`), `variant?` `"rise"` (12 px up, default), `"fade"`, `"scale"` (from 97%), `delay?` ms, `index?` (times `--stagger`), plus any HTML attributes | Fades in once on enter through one shared IntersectionObserver. Visible without JS and under reduced motion. Client component. |
| `TextReveal` | `text` (string), `as?` `"h1"` (default), `"h2"`, `"h3"`, `"p"`, `"span"`, `variant?` `"rise"` or `"blur"` (blur only for 6 words or fewer), plus HTML attributes | Words rise out of a mask, 30 ms apart, 600 ms expo-out. The words stay real text, so the heading's accessible name and `textContent` equal `text`. One per page, on the h1. |
| `NumberTicker` | `value`, `mode?` `"count"` (default) or `"roll"`, `format?` `(n) => string` (default en-IN whole number), `from?` 0, `duration?` 900, `className?` | Count: eases up on enter, then to new values. Roll: odometer for live values, only changed digits roll (500 ms, spring). Screen readers get the final value only; no `aria-live`. |
| `Magnetic` | `children`, `strength?` 0.3, `max?` 8 px, `className?` | Wraps any element with a 16 px attraction zone. For a `Button`, use `<Button magnetic>` instead. One per page. Server-safe. |
| `SpotlightCard` | `edge?` true, plus `div` props | `spot` + `spot-edge` + `lift` + `depth-2` card. Same as `<Card spotlight>`. Server-safe. |
| `Tilt` | `max?` 6 deg, plus `div` props | The attendee pass. Glare is z-index 1: give the QR `relative z-2`. Touch gets one sheen sweep instead. Server-safe. |
| `LivePulse` | `className?` (sets the colour through `text-*`, default `text-approved`) | Pulsing dot. Always next to the word "Live". |
| `ConfirmBurst` | `rays?` 8 or 4, `className?` | Rays burst once from the centre of the nearest positioned parent. Approve and successful check-in only. Change its `key` to replay. |
| `Backdrop` | `stage?`, `contained?`, `className?` | Two ambient lights, a faint grid, static grain; `stage` adds a third light behind the focal area. Fixed, or absolute with `contained`. |
| `Kicker` | `children`, `className?` | Mono uppercase label with a short rule after it. |
| `SkeletonText` | `lines?` 3, `className?` | 10 px bars on the text-sm rhythm; last line 64%. |
| `SkeletonCard` | `className?` | Card-shaped: title bar, two lines, footer chip. |
| `SkeletonRow` | `cols` (grid track sizes, for example `["2fr", "1fr", "6rem"]`), `className?` | One table row at the real column widths. |
| `PageTransition` | `children`, `className?` | Route crossfade (old out 120 ms, new in 240 ms). Put it where a new instance mounts per route: a `template.tsx` or the root of a page. Same-page refreshes never animate. |
| `SlidingIndicator` | `name` (unique per group), `className?` | Render inside the active item only; the pill or underline glides to the new item on route changes and on state set inside `startTransition`. `Tabs` uses it. |
| `Morph` | `name`, `children` (one element) | Shared element morph between two routes, for example `proposal-${id}` on the queue card and the detail header. |

| Helper | Signature | Notes |
| --- | --- | --- |
| `vtAnchor(name)` | returns `{ style }` | Spread on chrome (sidebar, top bar, site header, bottom bar, voice orb) so it stays still during route transitions. Unique names only. |
| `NAV_FORWARD`, `NAV_BACK` | `string[]` | Pass to `<Link transitionTypes={NAV_FORWARD}>` for a 60 px directional slide instead of the crossfade. |
| `useReducedMotion()` | `() => boolean` | False on the server. Check it in every JS-driven effect. |
| `prefersReducedMotion()` | `() => boolean` | Same check outside React. |
| `observeOnce(el, onEnter?)` | returns a cleanup | The shared observer: sets `data-in` once, then calls `onEnter`. |

### Utilities

| Class | What it does |
| --- | --- |
| `depth-1`, `depth-2`, `depth-3` | Inner highlight plus soft long shadow, by elevation. Theme-aware. |
| `edge` | Gradient hairline (uses `::before`). Key cards only, at most three per page. |
| `edge-live` | With `edge`: a travelling arc of light on the hairline. One small element per page. |
| `press` | Spring press: `scale: .97` on `:active`, spring back. On `Button` primary, secondary, destructive and on `Chip`. |
| `lift` | Hover: 2 px up and the border firms. No shadow animation. |
| `spot` | Cursor spotlight glow (uses `::before`). Not with `edge` on the same element. |
| `spot-edge` | With `spot`: the border lights up near the cursor (uses `::after`). |
| `grain` | Static grain on a positioned surface (uses `::before`). |
| `text-fade`, `text-hero`, `text-section` | Hero tone fade; fluid hero and section sizes. |
| `measure`, `measure-lede`, `measure-tight` | 65ch, 52ch, 44ch. |
| `shell-backdrop` | The ambient layer `Backdrop` renders. `data-stage` adds the third light. |

### Upgraded shared components (same APIs, plus optional props)

- `Button`: spring `press` on primary, secondary and destructive; primary has a lit top edge; the hover lift is now `translate`, so it composes with the press. New optional `magnetic` prop (replaces the hover lift with the magnetic pull). `buttonVariants` gains a `magnetic` key.
- `Card`: `depth-2`. New optional `spotlight` (spotlight, lit border, lift) and `edge` (gradient hairline). `CardFooter` sits 24 px below the body.
- `Tabs`: the active underline glides between tabs. Controlled and uncontrolled use work as before; value changes run inside `startTransition`.
- `Dialog`, `Sheet`: `rounded-sheet`, `depth-3`, expo-out entrance, faster exit, no overlay blur. Titles are `text-2xl`.
- `Select` menu, `Tooltip`: `depth-3`, small scale-in, faster exit. `Select` menu radius `rounded-inner`.
- `Input`, `Textarea`, `Select` trigger: `depth-1` and a soft focus halo in the ring colour (on top of the 2 px ring).
- `Toaster`: at most 3 visible, 8 px apart.
- `Skeleton`: a soft band sweeps across it and it stays invisible for the first 300 ms, so fast loads never flash. Theme-neutral fill.
- `Progress`, `Stepper`: fills grow with `translate` and `scale`, never width.
- `EmptyState`: 40 px icon tile in `curtain-soft`, `text-lg` title, one sentence at 44ch, one action 24 px below.
- `PageHeader`: kicker, 12 px, title (`text-2xl`, `text-3xl` from md, or `text-section` with `display`), 16 px, lede at 52ch; actions do not shrink; 48 px to the content.

### Recipes

```tsx
import { Button, Card, NumberTicker, Reveal, TextReveal, LivePulse, ConfirmBurst } from "@/components/ui";

<TextReveal as="h1" text={t("hero.title")} className="text-hero text-fade" />
<Button magnetic size="lg">{t("hero.cta")}</Button>

{items.map((item, i) => (
  <Reveal as="li" key={item.id} index={i}>
    <Card spotlight>...</Card>
  </Reveal>
))}

<span className="inline-flex items-center gap-2"><LivePulse /> {t("live")}</span>
<NumberTicker value={checkedIn} mode="roll" className="font-mono text-5xl tracking-[-0.04em]" />

<span className="relative inline-grid">
  <Button onClick={approve}>{t("approve")}</Button>
  {approved ? <ConfirmBurst key={approvedAt} /> : null}
</span>
```
