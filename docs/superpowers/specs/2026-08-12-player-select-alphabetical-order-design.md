# Player Select Alphabetical Order Design

## Goal

Display Player Select rows alphabetically by each player's first name.

## Design

Keep the behavior local to `PlayerSelectView`. After applying the existing search and status filters, sort the visible players without mutating the `players` prop. Compare the first word of each displayed name; when two players share a first name, compare their full displayed names for deterministic ordering.

Selected, active, and inactive state will not take precedence over alphabetical order. Search results and every filter view will therefore use the same ordering. Other screens that consume the player data will remain unchanged.

## Verification

Per the requested scope, do not add a new automated test. Run the existing focused component tests, type checking, and linting after implementation.
