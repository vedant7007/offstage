# Design tokens

The look of Sutradhar: a calm stage manager behind the curtain. Quiet, organised, warm, confident.

- Source of truth: `src/styles/tokens.css`. Tailwind mapping: `src/styles/theme.css`. Tailwind entry: `src/app/globals.css` (the file `components.json` points at), which also keeps the shadcn variables (`--background`, `--primary`, `--chart-*`, `--sidebar-*`, `--radius`) pointed at our tokens.
- Review page: `/design` (only when `DEMO_MODE=true`). Every primitive and composite, both themes, and a real 360 px frame.
- Contrast check: `pnpm contrast` reads the hex values from `tokens.css` and fails on any pairing below WCAG 2.2 AA. `pnpm contrast --write` refreshes the table below. Change a colour, run it, commit both.

## Themes

| Theme | Class | Feel |
| --- | --- | --- |
| Paper (light) | `.light` (default) | Warm off-white paper, ink text |
| Ink (dark) | `.dark` | Deep blue-black ink, warm off-white text |

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
| `bg` | Page background | `#faf6ef` | `#111318` |
| `surface` | Cards, inputs | `#fffdf9` | `#181b22` |
| `surface-raised` | Dialogs, menus, toasts | `#ffffff` | `#1f232c` |
| `surface-sunken` | Hover, table header, wells | `#f2ece1` | `#0c0e12` |
| `border` | Decorative 1 px lines | `#e4dacb` | `#2e3340` |
| `border-strong` | Control outlines (must be seen) | `#857866` | `#737b8d` |
| `fg` / `fg-muted` | Text / secondary text | `#1f1a16` / `#5a5146` | `#f2ede4` / `#aaa397` |
| `ring` | Focus outline | `#1f5aa6` | `#8ab4f8` |
| `curtain` | The one brand accent, muted crimson. Primary buttons, selection, active tab | `#9b2839` | `#b83a4d` |
| `agent` | Anything an agent did or is doing | `#0d6b69` | `#2a9d96` |
| `approved` | Approved, reversible | `#1e6b3a` | `#4cbf73` |
| `pending` | Waiting, warning | `#a86b12` | `#f2b94b` |
| `info` | Information, executed | `#1f5aa6` | `#8ab4f8` |
| `neutral` | Rejected, stale, undone, expired | `#7a7064` | `#8d8679` |
| `danger` | Destructive actions, errors | `#b42318` | `#ff7b72` |
| `emergency` | Emergencies only | `#c8102e` | `#d42a3a` |

shadcn names (`background`, `primary`, `muted-foreground`, `destructive` and so on) are mapped onto these, so components added later with the shadcn CLI pick up the palette. Tailwind's default palette is switched off: `bg-red-500` does not exist, on purpose.

## Contrast ratios

Text needs 4.5:1. Icons, control borders and the focus ring need 3:1 (WCAG 1.4.11).

<!-- contrast:begin -->
| Pair | Used for | Needs | Light | Dark |
| --- | --- | --- | --- | --- |
| `--fg` on `--bg` | Body text | 4.5:1 | 16.01 pass | 15.94 pass |
| `--fg` on `--surface` | Body text | 4.5:1 | 16.98 pass | 14.78 pass |
| `--fg` on `--surface-raised` | Body text | 4.5:1 | 17.25 pass | 13.49 pass |
| `--fg` on `--surface-sunken` | Body text | 4.5:1 | 14.67 pass | 16.57 pass |
| `--fg-muted` on `--bg` | Secondary text | 4.5:1 | 7.22 pass | 7.43 pass |
| `--fg-muted` on `--surface` | Secondary text | 4.5:1 | 7.66 pass | 6.89 pass |
| `--fg-muted` on `--surface-raised` | Secondary text | 4.5:1 | 7.78 pass | 6.29 pass |
| `--fg-muted` on `--surface-sunken` | Secondary text | 4.5:1 | 6.61 pass | 7.72 pass |
| `--border-strong` on `--bg` | Control borders | 3:1 | 4.00 pass | 4.38 pass |
| `--border-strong` on `--surface` | Control borders | 3:1 | 4.24 pass | 4.06 pass |
| `--ring` on `--bg` | Focus ring | 3:1 | 6.35 pass | 8.82 pass |
| `--ring` on `--surface` | Focus ring | 3:1 | 6.73 pass | 8.18 pass |
| `--ring` on `--surface-sunken` | Focus ring | 3:1 | 5.82 pass | 9.17 pass |
| `--on-curtain` on `--curtain` | Primary button | 4.5:1 | 7.62 pass | 5.60 pass |
| `--on-curtain` on `--curtain-hover` | Primary button hover | 4.5:1 | 9.61 pass | 6.96 pass |
| `--curtain` on `--bg` | Primary button edge | 3:1 | 7.07 pass | 3.32 pass |
| `--curtain-text` on `--bg` | Links, brand text | 4.5:1 | 7.07 pass | 8.13 pass |
| `--curtain-text` on `--surface` | Links, brand text | 4.5:1 | 7.50 pass | 7.54 pass |
| `--curtain-soft-fg` on `--curtain-soft` | Selected chip, tier badge | 4.5:1 | 8.61 pass | 9.02 pass |
| `--on-agent` on `--agent` | Agent avatar | 4.5:1 | 6.32 pass | 5.15 pass |
| `--agent` on `--surface` | Agent icon | 3:1 | 6.22 pass | 5.22 pass |
| `--agent-text` on `--bg` | Agent text | 4.5:1 | 6.94 pass | 10.49 pass |
| `--agent-text` on `--surface` | Agent text | 4.5:1 | 7.36 pass | 9.73 pass |
| `--agent-soft-fg` on `--agent-soft` | Simulated badge | 4.5:1 | 7.54 pass | 9.28 pass |
| `--approved` on `--surface` | Approved icon | 3:1 | 6.42 pass | 7.39 pass |
| `--approved-text` on `--surface` | Approved text | 4.5:1 | 7.37 pass | 9.79 pass |
| `--approved-soft-fg` on `--approved-soft` | Approved badge | 4.5:1 | 7.70 pass | 9.52 pass |
| `--pending` on `--surface` | Pending icon | 3:1 | 4.33 pass | 9.70 pass |
| `--pending-text` on `--surface` | Pending text | 4.5:1 | 6.95 pass | 11.05 pass |
| `--pending-soft-fg` on `--pending-soft` | Pending badge, warning alert | 4.5:1 | 7.24 pass | 9.00 pass |
| `--info` on `--surface` | Info icon | 3:1 | 6.73 pass | 8.18 pass |
| `--info-text` on `--surface` | Info text | 4.5:1 | 7.40 pass | 9.32 pass |
| `--info-soft-fg` on `--info-soft` | Executed badge, info alert | 4.5:1 | 7.39 pass | 8.48 pass |
| `--neutral` on `--surface` | Neutral icon | 3:1 | 4.77 pass | 4.77 pass |
| `--neutral-soft-fg` on `--neutral-soft` | Rejected, stale, undone badges | 4.5:1 | 7.85 pass | 8.74 pass |
| `--danger` on `--surface` | Danger icon, destructive border | 3:1 | 6.47 pass | 6.83 pass |
| `--danger-text` on `--bg` | Error text | 4.5:1 | 6.77 pass | 8.14 pass |
| `--danger-text` on `--surface` | Error text | 4.5:1 | 7.18 pass | 7.55 pass |
| `--danger-soft-fg` on `--danger-soft` | Danger alert | 4.5:1 | 7.58 pass | 8.34 pass |
| `--on-emergency` on `--emergency` | Emergency banner | 4.5:1 | 5.88 pass | 5.01 pass |
| `--emergency` on `--bg` | Emergency border | 3:1 | 5.46 pass | 3.71 pass |
| `--emergency-soft-fg` on `--emergency-soft` | Emergency alert | 4.5:1 | 7.07 pass | 8.26 pass |
<!-- contrast:end -->

## Type

- UI: **Noto Sans** (variable). Devanagari falls back to **Noto Sans Devanagari**, loaded only when Devanagari text appears.
- Display: **Eczar** (variable, Latin and Devanagari), for public page headings only (`font-display`, or `PageHeader display`). Never in the console or crew app.

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
- Radius: `rounded-control` 8 px for buttons, inputs, alerts. `rounded-card` 16 px for cards, sheets, dialogs. `rounded-full` for badges, chips, avatars. shadcn's scale (`rounded-sm` to `rounded-4xl`, from `--radius` = 8 px) stays available for CLI-added components.
- Borders over shadows: 1 px `border` lines separate things. Only floating layers (dialogs, sheets, menus, toasts) get a shadow.
- Motion: `--duration-fast` 150 ms, `--duration-base` 200 ms, `--duration-slow` 250 ms, `ease-out` curve. Only for state changes (open, close, toggle). Nothing animates on load. `prefers-reduced-motion: reduce` turns all transitions and animations off.
- Layers: `z-(--z-sticky)` 10, `--z-appbar` 20, `--z-overlay` 40, `--z-modal` 50, `--z-toast` 60, `--z-tooltip` 70.
- Touch targets: every interactive element is at least 44 x 44 px on phones (`min-h-11`). Some tighten to 36 px from md up.

## Usage rules

1. **Status looks come only from `StatusBadge`.** Never colour a state by hand. Every state has an icon and a word, so colour is never the only signal. The vocabulary: `pending`, `approved`, `executed`, `rejected`, `stale`, `undone`, `simulated`, `emergency`, plus `draft`, `executing`, `failed`, `expired` so every proposal status has a look.
2. **Red means emergency.** The only solid red is `--emergency`, always with the stripe pattern, siren icon and uppercase title. Errors and destructive actions use `danger` as text, borders and tints, never a big red fill.
3. **Teal means an agent.** Agent avatars, simulated proposals, citations. The Commander alone wears curtain crimson because it leads the team.
4. **Crimson is for the one main action on a screen** (`Button` primary), selection, and the active tab. If everything is crimson, nothing is.
5. **Simulations are dashed.** Anything from a what-if run has a dashed teal border and the `simulated` badge, so nobody mistakes it for real state.
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
