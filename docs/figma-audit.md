# Figma Audit

Figma file: https://www.figma.com/design/kH0B0CXS1UYfFjTDat3KJW/Badminton-Rankings?node-id=0-1

The implementation attempted to inspect the file through the Figma MCP before UI work, but the connected Figma account returned the Starter plan MCP tool-call limit. Because of that, active frames could not be exported or compared in this pass.

Implementation used the plan's active screen list as the accepted design inventory and intentionally ignored any frame whose name includes `(old)`.

Follow-up visual QA when the Figma MCP limit is reset:

- Export active mobile frames for login, group dashboard, rankings, members/invite, join confirmation, match entry, match confirmation/dispute, history, and profile.
- Capture local app screenshots at a phone-width viewport.
- Compare layout, copy, spacing, palette, type scale, card radius, bottom navigation, and control states.
- Record any drift before release.
