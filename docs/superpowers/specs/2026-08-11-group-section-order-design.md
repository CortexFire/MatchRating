# Group Section Order Design

## Goal

Reorder the group detail page so members are easier to reach without changing any section's content or behavior.

## Page order

After the group header, render the existing sections in this order:

1. Rating rebuild status notice
2. Members disclosure
3. Active matches
4. Recent matches

The members disclosure remains collapsed by default. Data loading, links, empty states, and match behavior remain unchanged.

## Implementation

Reorder the existing component instances in `src/app/groups/[groupId]/page.tsx`. Do not introduce CSS ordering or a new layout abstraction because the semantic document order should match the visual order.

## Verification

Update the group page test to assert the relative positions of the four section labels in rendered HTML. Run the focused page test, then the relevant broader checks.
