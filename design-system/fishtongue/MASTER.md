# FishTongue Design System — Quiet Modernism

> Version: 1.2.2  
> Status: Locked baseline  
> Owner: FishTongue maintainer  
> Scope: Phase 1.5 and later desktop UI

## Authority and change control

This file is the visual source of truth. `frontend-design` may compose pages,
`emil-design-eng` may refine interaction, and `web-design-guidelines` may audit
and fix compliance. None of them may change the style, color palette, font
families, spacing scale, radii, elevation, icon language, or motion tokens
without explicit user approval.

Page overrides may define page-specific layout dimensions only. They must not
redefine global visual tokens. Any approved token change requires a version
update and a changelog entry.

## Design direction

**Name:** Quiet Modernism / 静谧现代主义

**Character:** pragmatic, precise, modernist, minimal, flat, calm, premium,
information-dense, desktop-native.

Premium quality comes from alignment, restraint, typography, predictable
interaction, and careful state design—not gradients, glass, oversized headings,
decorative animation, or large empty cards.

### Core principles

1. Content is the visual center; chrome stays quiet.
2. Neutral surfaces establish hierarchy; one indigo accent signals action and selection.
3. Borders and surface shifts separate regions; shadows are reserved for overlays.
4. Compact does not mean cramped: use a 4 px rhythm and predictable control sizes.
5. Every state is visible in color, shape, icon, or text—not color alone.
6. Chinese and English share the same component geometry and semantic hierarchy.
7. Desktop patterns, keyboard use, and resizable panes take priority over mobile conventions.

## Prohibited visual patterns

- Marketing-page hero sections, giant headlines, centered single-column workspaces.
- Beige editorial styling, serif display headings, ornamental typography.
- Glassmorphism, blur as decoration, gradients, glow, textured backgrounds.
- Large floating cards, heavy or arbitrary shadows, excessive rounded containers.
- Multiple brand accents, orange CTA accents, saturated status colors used decoratively.
- Emoji or mixed icon families.
- Raw hex values, ad-hoc spacing, or one-off font declarations inside components.
- Animation without functional meaning.

## Color system

### Global palette

| Token | Value | Purpose |
| --- | --- | --- |
| `neutral-0` | `#FFFFFF` | Highest light surface |
| `neutral-25` | `#F9FAFB` | Light raised region |
| `neutral-50` | `#F5F6F8` | Light app background |
| `neutral-100` | `#F0F2F5` | Light secondary surface |
| `neutral-200` | `#E5E8ED` | Light hover and subtle separator |
| `neutral-300` | `#D9DDE5` | Light border |
| `neutral-400` | `#B8C0CC` | Strong border and inactive glyph |
| `neutral-500` | `#7B8491` | Disabled-only content |
| `neutral-600` | `#5F6875` | Tertiary readable text |
| `neutral-700` | `#4D5562` | Secondary text |
| `neutral-800` | `#2F343D` | Strong text |
| `neutral-900` | `#17191D` | Primary light text |
| `neutral-950` | `#111318` | Dark app background |
| `indigo-50` | `#EEF2FF` | Light selected/brand-soft surface |
| `indigo-100` | `#E0E7FF` | Light brand-hover surface |
| `indigo-600` | `#4F46E5` | Primary accent |
| `indigo-700` | `#4338CA` | Primary accent hover/pressed |
| `indigo-800` | `#3730A3` | Text on light brand surface |
| `indigo-300` | `#A5B4FC` | Dark focus and hover accent |
| `indigo-400` | `#818CF8` | Dark primary accent |
| `red-700` | `#B91C1C` | Light destructive |
| `amber-700` | `#A16207` | Light warning |
| `green-700` | `#15803D` | Light success |

### Light semantic tokens

| Token | Value |
| --- | --- |
| `color-bg-app` | `#F5F6F8` |
| `color-bg-sidebar` | `#F0F2F5` |
| `color-bg-workspace` | `#FFFFFF` |
| `color-bg-subtle` | `#F9FAFB` |
| `color-bg-hover` | `#F0F2F5` |
| `color-bg-selected` | `#EEF2FF` |
| `color-bg-disabled` | `#F0F2F5` |
| `color-text-primary` | `#17191D` |
| `color-text-secondary` | `#4D5562` |
| `color-text-tertiary` | `#5F6875` |
| `color-text-disabled` | `#7B8491` |
| `color-border-subtle` | `#E5E8ED` |
| `color-border-default` | `#D9DDE5` |
| `color-border-strong` | `#B8C0CC` |
| `color-accent` | `#4F46E5` |
| `color-accent-hover` | `#4338CA` |
| `color-accent-soft` | `#EEF2FF` |
| `color-on-accent` | `#FFFFFF` |
| `color-on-accent-soft` | `#3730A3` |
| `color-focus` | `#4F46E5` |
| `color-danger` | `#B91C1C` |
| `color-warning` | `#A16207` |
| `color-success` | `#15803D` |
| `color-scrim` | `rgba(17, 19, 24, 0.48)` |

### Dark semantic tokens

| Token | Value |
| --- | --- |
| `color-bg-app` | `#111318` |
| `color-bg-sidebar` | `#15181E` |
| `color-bg-workspace` | `#171A21` |
| `color-bg-subtle` | `#1D212A` |
| `color-bg-hover` | `#232833` |
| `color-bg-selected` | `#25264A` |
| `color-bg-disabled` | `#1D212A` |
| `color-text-primary` | `#F4F5F7` |
| `color-text-secondary` | `#C7CBD1` |
| `color-text-tertiary` | `#9CA3AF` |
| `color-text-disabled` | `#737B88` |
| `color-border-subtle` | `#292F3A` |
| `color-border-default` | `#303642` |
| `color-border-strong` | `#465062` |
| `color-accent` | `#818CF8` |
| `color-accent-hover` | `#A5B4FC` |
| `color-accent-soft` | `#25264A` |
| `color-on-accent` | `#111318` |
| `color-on-accent-soft` | `#C7D2FE` |
| `color-focus` | `#A5B4FC` |
| `color-danger` | `#FCA5A5` |
| `color-warning` | `#FDE68A` |
| `color-success` | `#86EFAC` |
| `color-scrim` | `rgba(0, 0, 0, 0.60)` |

Status colors are semantic only. Always pair status color with an icon, label,
or pattern. The indigo accent is the only brand/action accent.

## Typography

No web font may be fetched at runtime. Use native system fonts so the offline
desktop app remains crisp, fast, and visually native.

| Token | Value |
| --- | --- |
| `font-ui` | `"Segoe UI Variable Text", "Segoe UI", "Microsoft YaHei UI", "Noto Sans SC", sans-serif` |
| `font-code` | `"Cascadia Code", "Cascadia Mono", "SFMono-Regular", Consolas, monospace` |
| `font-linguistic` | `"Segoe UI", "Noto Sans", "Charis SIL", sans-serif` |
| `weight-regular` | `400` |
| `weight-medium` | `500` |
| `weight-semibold` | `600` |

### Type roles

| Role | Size / line height | Weight | Usage |
| --- | --- | --- | --- |
| `caption` | `11px / 16px` | 400 | Auxiliary metadata only |
| `label-small` | `12px / 16px` | 500 | Compact labels, status bar |
| `body-small` | `13px / 18px` | 400 | Dense rows, secondary UI |
| `body` | `14px / 20px` | 400 | Default UI text |
| `body-strong` | `14px / 20px` | 600 | Emphasis, selected rows |
| `subtitle` | `16px / 22px` | 600 | Panel and modal titles |
| `title-small` | `20px / 28px` | 600 | Workspace title |
| `title` | `24px / 32px` | 600 | Welcome/project title maximum |

Use sentence case. Do not use all caps or letter-spaced eyebrow text. Numeric
table columns use `font-variant-numeric: tabular-nums`.

## Spacing and geometry

### Spacing scale

`2, 4, 6, 8, 12, 16, 20, 24, 32, 40`

| Token | Value |
| --- | --- |
| `space-0-5` | `2px` |
| `space-1` | `4px` |
| `space-1-5` | `6px` |
| `space-2` | `8px` |
| `space-3` | `12px` |
| `space-4` | `16px` |
| `space-5` | `20px` |
| `space-6` | `24px` |
| `space-8` | `32px` |
| `space-10` | `40px` |

### Radius, border, and elevation

| Token | Value | Usage |
| --- | --- | --- |
| `radius-xs` | `2px` | Table selection, compact tags |
| `radius-sm` | `4px` | Inputs, buttons, rows |
| `radius-md` | `6px` | Popovers, small panels |
| `radius-lg` | `8px` | Modals only |
| `border-width` | `1px` | Default separators |
| `shadow-none` | `none` | All in-flow surfaces |
| `shadow-overlay` | `0 8px 24px rgba(17, 19, 24, 0.14)` | Menus and popovers |
| `shadow-modal` | `0 18px 48px rgba(17, 19, 24, 0.22)` | Modal dialogs |

Do not use pill shapes except status tags and tokens. Do not use shadows on
cards, toolbars, sidebars, tables, or in-flow panels.

### Layer scale

| Token | Value | Usage |
| --- | --- | --- |
| `z-base` | `0` | Normal content |
| `z-sticky` | `10` | Sticky table and toolbar regions |
| `z-dropdown` | `20` | Menus, selects, popovers |
| `z-overlay` | `30` | Scrim and blocking overlay |
| `z-modal` | `40` | Modal dialog |
| `z-toast` | `50` | Notifications |
| `z-tooltip` | `60` | Tooltips |

Components must use this scale and avoid arbitrary z-index values. Each overlay
root owns one documented stacking context.

## Desktop shell

| Region | Token / rule |
| --- | --- |
| Minimum supported viewport | `1360 × 860` |
| Reference viewport | `1440 × 900` |
| Custom title bar | `36px`; application identity, page title, drag region, window controls |
| Custom menu bar | `28px`; keyboard-accessible application menus |
| Context toolbar | `40px` |
| Primary sidebar | `220px`, resizable `220–300px`, collapsed `48px` |
| Main workspace | Flexible, minimum `620px` |
| AI sidebar | Responsive `clamp(260px, 22vw, 360px)`, collapsed `0px` |
| Status bar | `24px` |
| Splitter hit area | `6px`, visible rule `1px` |
| Workspace padding | `16px`; dense tables may reach region edges |
| Modal width | `480px` default; `640px` complex; max `calc(100vw - 64px)` |

Below the supported desktop minimum, opening the AI sidebar passively collapses navigation. Expanding it uses a 220px overlay so the main workspace and AI sidebar do not reflow.
The primary navigation remains available. Do not introduce mobile navigation.
At constrained heights, navigation rows and AI preview spacing use the compact density tier so every persistent control remains reachable without scrolling.
The AI sidebar uses its own inline-size container: below `340px`, context controls reflow from three columns to two and all copy wraps inside the panel.

## Component density

| Component | Default size |
| --- | --- |
| Standard button/input/select | `32px` height |
| Compact toolbar control | `28px` height |
| Icon button | `28 × 28px`; `32 × 32px` for primary toolbar |
| Table row | `36px`; optional comfortable mode `44px` |
| Navigation row | `32px` |
| Tab | `32px` height |
| Menu item | `30px` height |
| Status tag | `20px` height |
| Form vertical gap | `12px` |

All interactive elements need visible hover, pressed, selected, disabled, and
keyboard-focus states. Compact desktop sizing must be paired with keyboard
access and stable hit areas.

## Interaction states

- **Hover:** neutral surface shift; never move or resize the element.
- **Pressed:** one darker surface step or accent-hover; duration `80ms`.
- **Selected:** accent-soft background plus text/icon or a 2 px accent indicator.
- **Focus:** 2 px focus ring with 1 px offset; never remove it.
- **Disabled:** semantic `disabled`, reduced emphasis, no pointer response.
- **Read-only:** normal readability plus lock/read-only label; not styled as disabled.
- **Loading:** preserve component dimensions; show progress after `300ms`.
- **Error:** place cause and recovery beside the affected field or region.

## Motion

Motion is functional and subtle. Do not add GSAP or decorative page reveals.

| Token | Value | Usage |
| --- | --- | --- |
| `motion-instant` | `80ms` | Press feedback |
| `motion-fast` | `120ms` | Hover and focus color |
| `motion-base` | `160ms` | Menu, tooltip, local state |
| `motion-panel` | `200ms` | Sidebar and drawer |
| `motion-modal` | `220ms` | Modal enter |
| `motion-modal-exit` | `150ms` | Modal exit |
| `ease-standard` | `cubic-bezier(0.2, 0, 0, 1)` | General transition |
| `ease-exit` | `cubic-bezier(0.4, 0, 1, 1)` | Exit transition |

Animate only `opacity` and `transform` where practical. With
`prefers-reduced-motion: reduce`, use `0ms` and preserve all state information.

## Icons

- Primary icon family: Radix Icons already included in the project.
- Use outline icons consistently; no emoji, filled/outline mixing, or decorative icon containers.
- Sizes: `14px` compact, `16px` default, `20px` prominent.
- Icon-only controls require an accessible name and tooltip.
- If Radix lacks an icon, create a matching 16 px SVG using the same visual weight.

## Tables, trees, and editors

- Tables use sticky headers, 36 px rows, subtle row separators, and hover/selected states.
- Numeric fields align right and use tabular figures; text aligns left.
- Sorting state includes icon and accessible text, not color alone.
- Trees use no more than necessary nesting; each row exposes at most three inline actions.
- Detail panes use 16 px section padding and 24 px between major sections.
- CodeMirror uses `font-code`, workspace surface colors, and the same focus/border tokens.
- Lists expected to exceed 50 rows should be virtualized during implementation.

## Accessibility floor

- Normal text contrast: at least `4.5:1`; large text and non-text UI: at least `3:1`.
- Keyboard order follows visual order; all critical flows are keyboard-complete.
- Provide a keyboard-only “skip to main workspace” action before persistent navigation.
- Color never carries meaning alone.
- Form labels stay visible; errors state cause and recovery.
- Modals trap focus, return focus to their trigger, close with `Escape`, and protect unsaved changes.
- Text respects Windows scaling without clipping core actions.
- The application remains usable with reduced motion and high-contrast preferences.

## Handoff rules by skill

### `frontend-design`

Owns the single visual composition. It must use these tokens and may not
introduce a competing aesthetic, palette, font, or component geometry.

### `emil-design-eng`

Refines state transitions, keyboard feel, perceived responsiveness, and panel
behavior after layouts stabilize. It may select only the motion tokens above.

### `web-design-guidelines`

Audits accessibility, behavior, and consistency. Fixes must map to existing
tokens. A compliance issue that truly requires a token change must be reported
to the user instead of silently changing the design.

## Reference direction

- Fluent 2: semantic tokens, native system typography, neutral surface hierarchy.
- Visual Studio Code: stable workbench regions, contextual toolbars, secondary sidebar, status bar.
- Linear: calm hierarchy, dimmer navigation chrome, consistent headers and controls.
- Carbon: dense tables with explicit hover, focus, selected, and layered surface tokens.

These are pattern references, not templates. FishTongue must remain visually
distinct through its indigo accent, language-focused information architecture,
and restrained desktop geometry.

## Changelog

- `1.1.0` — Replaced native window chrome with the approved custom 36 px title bar and 28 px menu bar.
- `1.2.0` — Raised the desktop minimum to `1360 × 860`, protected a `620px` main workspace, and defined non-reflowing overlay navigation for constrained widths.
- `1.2.1` — Narrowed primary navigation to `220px`, added compact vertical density, and placed a history-aware Back action in the context toolbar.
- `1.2.2` — Replaced the fixed AI width with a responsive `260–360px` range and container-based internal reflow.
- `1.0.0` — Initial locked Phase 1.5 baseline.
