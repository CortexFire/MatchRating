# Full Score Tile Click Target Design

## Goal

Make the full colored score tile in Match Recording select that team as the set winner. The score input remains independently editable and must not change the winner when clicked.

## Design

Keep `ScoreTile` as the owner of winner selection and score editing. Expand its existing native winner `<button>` from the centered score panel to the bounds of the outer tile. Layer the visual score panel above that button without allowing the panel's decorative areas to intercept pointer input. Keep the number input interactive above both layers.

This preserves the existing appearance, native button keyboard behavior, accessible name, and `aria-pressed` state. When `editable` is false, the winner button and score input remain disabled.

## Interaction Rules

- Clicking any part of the colored tile except the score input selects that team as winner.
- Clicking or focusing the score input edits the score without selecting a winner.
- Selecting a winner does not swap or otherwise modify either score.
- Keyboard activation of the winner button continues to select the team.
- Read-only match views remain non-interactive.

## Testing

Add a regression test that clicks an outer-area element belonging to the tile rather than the centered winner control. Assert that the selected team changes and both score values remain unchanged. Retain the existing winner, score-editing, and read-only tests, then run the focused component test suite followed by the project's broader verification commands.

## Scope

Only the `ScoreTile` click target and its regression coverage change. Styling, score validation, winner calculation, draft saving, and match submission behavior remain unchanged.
