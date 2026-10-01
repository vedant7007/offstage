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

- UI and display: **Inter Tight** (variable, `--font-grotesk`), for everything. `font-sans` and `font-display` both point at it. Headings are weight 500 with `-0.03em` tracking (`h3` `-0.015em`), set in the base layer.
- Mono: **IBM Plex Mono** 400 and 500 (`--font-plex-mono`, Tailwind `font-mono`), for kickers, labels, numbers and tier chips.
- Devanagari falls back to **Noto Sans Devanagari**, loaded only when Devanagari text appears.
- `kicker` utility: mono, 12 px, weight 500, `0.12em` tracking, uppercase. Use it for the small label above a heading.

| Token | Size | Line height | Use |
| --- | --- | --- | --- |
| `text-xs` | 12 | 18 | Badges, meta |
| `text-sm` | 14 | 22 | Hints, secondary text, table cells |
| `text-base` | 16 | 24 | Body, inputs (16 stops iOS zooming into fields) |
| `text-lg` | 18 | 28 | Card titles |
| `text-xl` | 22 | 30 | Section titles, dialog titles |
| `text-2xl` | 28 | 36 | Page title on phones |
| `text-3xl` | 36 | 44 | Page title from md |
| `text-4xl` | 48 | 56 | Public hero only |

Line heights are generous so Devanagari matras are not clipped. No other sizes: `text-[13px]` style values are not allowed.

## Spacing, radius, motion, layers

- Spacing: 4 px base (`p-1` = 4 px, `p-4` = 16 px). Page gutter 16 px on phones, 32 px from md.
- Radius: `rounded-control` 3 px for inputs and alerts. `rounded-card` 18 px for cards, sheets, dialogs. Buttons, badges, chips and avatars are pills (`rounded-full` or `rounded-pill`, 999 px). shadcn's scale (`rounded-sm` to `rounded-4xl`, from `--radius` = 3 px) stays available for CLI-added components.
- Borders and shadows: 1 px hairline `border` lines separate things. Cards may add the soft long `shadow-card`; floating layers (dialogs, sheets, menus, toasts) get a shadow.
- Motion: `--duration-fast` 150 ms, `--duration-base` 200 ms, `--duration-slow` 250 ms, `--duration-slower` 400 ms, on one `ease-out` curve, `cubic-bezier(.4, 0, .1, 1)`. Allowed: a 2 px lift on hover, spotlight or gradient-border hover on key cards, count-up numbers, staggered reveals. No glass walls, particles or purple gradient backgrounds. `prefers-reduced-motion: reduce` turns all transitions and animations off.
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
