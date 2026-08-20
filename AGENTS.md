<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Project Documentation

## UI-impacting work

Before planning or implementing work that affects layout, styling, components, interactions, responsiveness, or accessibility, read and follow the root-level `design.md` file. Do not update `design.md` unless the user explicitly requests it.

## Styling and incremental CSS Modules migration

Use CSS Modules as the default for new UI styling.

When making UI-impacting changes to an existing component, page, or layout that uses Tailwind utilities, migrate all styling in that file to a colocated `<name>.module.css` file as part of the same change. Do not migrate unrelated components or files.

Follow these rules:

- Do not mix Tailwind utility classes and CSS Module classes within a migrated component.
- Tailwind may remain in untouched files. Do not remove Tailwind dependencies or configuration until explicitly requested and no remaining code depends on them.
- Keep `globals.css` limited to truly global concerns such as design tokens, resets, font defaults, and base element styles. Keep component-specific styles in CSS Modules.
- Name modules consistently as `<component-name>.module.css`, import them as `styles`, and use semantic lower-camel-case class names such as `styles.primaryButton`.
- Use the CSS custom properties defined in `globals.css` for design tokens. Do not duplicate token values or hard-code design colors in modules.
- Express variants and conditional states with explicit module classes combined using `clsx`. Put responsive rules, pseudo-classes, and interaction states in the module rather than inline styles.
- Avoid `:global`, cross-module overrides, and reliance on stylesheet import order. Share styling through reusable components or global CSS custom properties.
- Preserve the component’s behavior, responsive layout, accessibility states, and visual appearance during migration.