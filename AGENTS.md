# AGENTS.md - Obsidian Request Plugin

## Project Overview

**obsidian-request** is an API request collection plugin for Obsidian. Each note that contains a ` ```request-collection ` code block gets its own separate collection of API requests.

## Architecture

### Data Storage
- Collections are stored in the plugin's data directory: `.obsidian/plugins/obsidian-request/collections/`
- Each note gets its own collection file named after the note: `<note-basename>.json`
- Example: Note `MyAPI.md` → Collection `collections/MyAPI.json`
- Notes reference collections using a code block: ````request-collection`
- When a note is renamed via Obsidian, the collection file is automatically renamed
- When a note is deleted, its collection file is automatically deleted

### Core Modules
- `src/main.ts` - Plugin entry point, code block processor, file rename/delete listeners
- `src/storage.ts` - Collection data loading/saving/renaming/deletion
- `src/network.ts` - HTTP request execution (Obsidian requestUrl + Node.js fallback)
- `src/preRequests.ts` - Dependency chain execution with variable extraction
- `src/importExport.ts` - External collection format import/export
- `src/types.ts` - TypeScript interfaces
- `src/constants.ts` - Default auto headers
- `src/ui/App.tsx` - Main React UI component
- `src/ui/PreRequestsTab.tsx` - Pre-request dependencies UI
- `src/ui/formatter.ts` - Response syntax highlighting

### Key Patterns
- State flows up via `onSave` callbacks, persists to plugin data folder
- Collection name is derived from note path via `getCollectionNameFromNotePath()`
- Variable substitution: `{{variableName}}` syntax, environment + local scope
- HTTP: Obsidian `requestUrl()` with Node.js fallback for file uploads/SSL
- UI: React 18 with JSX, rendered inside Obsidian's DOM
- Folders replace dividers — requests grouped via `folderId`, folders have `itemType: 'folder'`

## Development Commands

```bash
npm run dev        # Watch mode build
npm run build      # Production build (output to dist/)
npm run lint       # Run ESLint (strict: 0 errors required)
npm run lint:fix   # Fix ESLint issues
npm run typecheck  # TypeScript type check (0 errors required)
npm run format     # Format with Prettier
npm test           # Run tests
npm test:watch     # Watch mode tests
```

## PR Checklist

Before submitting a PR, ensure the following pass with 0 errors:

1. `npm run lint` — ESLint (strict config, 0 errors)
2. `npm run typecheck` — TypeScript `--noEmit` (strict, 0 errors)
3. `npm test` — All existing tests pass

## Testing Guidelines

- **Vitest** for unit tests
- Test files: `*.test.ts` or `*.test.tsx` alongside source or in `__tests__/`
- **Scope tests to business logic only:** storage I/O, variable substitution, import/export, formatter
- Do NOT write tests for React UI components (App.tsx, PreRequestsTab.tsx) — UI is tested manually in Obsidian
- Mock Obsidian APIs when testing plugin-specific code

## Code Conventions

- TypeScript with strict mode (strict: true, noUnusedLocals, noUnusedParameters)
- React 18 functional components with hooks
- No class components except Obsidian plugin/view classes
- 4-space indentation
- Single quotes for strings
- No semicolons where optional
- Components: PascalCase, functions/variables: camelCase
- Interfaces: PascalCase with descriptive names
- File names: camelCase for modules, PascalCase for React components
- No `any` types — use proper types or `unknown`
- Prefer `??` over `||` for nullish coalescing, use optional chaining `?.`

## Plugin Naming

- Plugin ID: `obsidian-request`
- Display name: `Obsidian Request`
- Internal classes: `ObsidianRequestPlugin`, `RequestCollectionView`
- View type: `request-collection-view`
- CSS prefix: `obsidian-request-`
- Code block language: `request-collection`

## Collection Initiation in Notes

To embed a request collection in a note, write a code block:

```request-collection
Optional description text here
```

The plugin will:
1. Detect the code block on render
2. Derive collection name from the note's filename (without .md extension)
3. Load collection from `.obsidian/plugins/obsidian-request/collections/<note-name>.json`
4. Create the collection file if it doesn't exist
5. Render the request editor UI in place of the code block

## Build Output

- All build artifacts go to `dist/` folder
- `dist/main.js` - Bundled plugin code
- `dist/manifest.json` - Plugin manifest (copied from root)
- `dist/styles.css` - Plugin styles (copied from root)
- The `dist/` folder is gitignored
