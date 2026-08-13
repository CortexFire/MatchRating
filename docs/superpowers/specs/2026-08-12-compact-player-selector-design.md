# Compact Player Selector Design

## Goal

Make the Player Select roster easier to scan by showing five complete player cards plus a visible portion of the sixth card, while preserving the interaction and accessibility requirements in `design.md`.

## Roster Geometry

- Reduce each selectable player card from 72px to 60px tall.
- Keep the existing 8px gap between cards.
- Cap the roster viewport at 352px: five complete 60px cards, five 8px gaps, and 12px (20%) of the sixth card.
- Use vertical scrolling when the visible roster exceeds the viewport. Shorter rosters shrink naturally rather than leaving an empty fixed-height area.
- Label the scroll region `Available players`. Make it keyboard-focusable only when it can overflow, and use the standard green focus-visible outline.

## Player Card Styling

- Keep the existing neutral surface, stroke, selection, disabled, and focus treatments.
- Reduce the avatar from 48px to 40px.
- Reduce the player name from 16px to 14px and tighten horizontal spacing to fit the shorter row.
- Retain the 12px inactive-status label and truncate long player names.
- Keep the full 60px row as the interactive target, exceeding the 44px minimum in `design.md`.

## Search Copy

Change both the visible placeholder and accessible input label from `Search for a player` to `Add a guest or search for a player`. Guest creation and filtering behavior remain unchanged.

## Scope

The change is limited to the Player Select roster and its tests. Team previews, filter controls, selection rules, guest creation, empty state, and Add players/Cancel actions remain unchanged.

## Verification

- Component tests assert the 60px card height, 352px scroll cap, 8px gaps, overflow behavior, accessible region label, conditional keyboard focus, green focus treatment, and revised search copy.
- Existing recorder tests continue to cover player filtering, guest creation, selection, and empty-state behavior using the revised accessible label.
- Run the focused recorder suite, typecheck, lint, and build.
- Browser-check the Player Select screen at 390px and 430px widths, including at least six players, long names, keyboard focus, and scrolling.
