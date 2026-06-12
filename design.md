# Design Guide

## Color Tokens

- App background: `#F7F4EE`
- Surface/card background: `#FFFCF7`
- Default stroke/divider: `#D9D2C3`
- Primary text: `#17392F`
- Muted text: `#6F877E`
- Selection fill: `#EBFFEE`
- Selection stroke: `#02542D`
- Victory fill: `#DDEFE4`
- Victory stroke: `#2F7D57`

Use green only for active, selected, confirmed, winning, or primary action states.

## Layout

- Design for a narrow phone viewport; center and cap desktop rendering around `390-430px`.
- Page background is always `#F7F4EE`.
- Use `16px` page padding, `8px/12px/16px` spacing steps, and compact vertical rhythm.
- Keep headers at the top, primary actions near the bottom, and bottom navigation fixed.
- Use scroll only for content regions; navigation and final action areas should remain stable.

## Typography

- Use Inter.
- Screen titles: bold, `20-24px`.
- Section titles and row names: semibold/bold, `14-16px`.
- Body, labels, form text: `12-14px`.
- Metadata and nav labels: `10-12px`.
- Scores and ratings use bold tabular numerals.

## Components

- Cards/rows: `#FFFCF7` fill, `1px #D9D2C3` stroke, `6-8px` radius.
- Inputs/search: same surface and stroke, `44px` minimum height, muted placeholder text.
- Buttons: `44px` minimum height. Primary actions are solid green with white text; secondary actions are stroked surfaces.
- Pills/chips: rounded, compact, semibold text; use green fills only for active or successful states.
- Avatars: circular initials, muted beige/green fills, bold short initials.
- Icons: simple outline icons, `16-20px`, muted by default and green when active.

## States

- Selected player/team/control: `#EBFFEE` fill with `#02542D` stroke.
- Winning score/result: `#DDEFE4` fill with `#2F7D57` stroke.
- Unselected/loss/neutral: `#FFFCF7` fill with `#D9D2C3` stroke.
- Pending/review states should be visibly calm and secondary, not error-styled.
- Focus states must be visible and use the green system.

## Navigation

- Bottom navigation is icon-first and fixed to the phone shell.
- The central record/add action is the strongest nav item, shown as a plus action.
- Active nav state uses a green-tinted background and dark green text/icon.

## Implementation Rules

- Prefer reusable components for cards, buttons, inputs, badges, player rows, score tiles, and bottom nav.
- Do not hard-code colors in components; use named design tokens/CSS variables.
- Do not introduce new colors unless a new semantic state requires one.
- Keep copy short and action-oriented.
- Minimum tap target is `44px`.
- Preserve contrast for all text and interactive states.
