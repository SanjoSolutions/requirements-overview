# Requirements

Local requirement editor built with TypeScript, Vite, and Bootstrap.

Select a project to view its complete requirement outline. Headings use the `describe` text, and nested `describe` blocks preserve their hierarchy. Click a test description to edit it in place. **Enter** saves the description text in the test file; **Esc** cancels. Search refines the selected project. Hover over a test or focus its row to reveal the icon on the right, then open its source line in VS Code.

Test source edits, additions, removals, and project configuration changes update the view automatically. A debounced file watcher refreshes the shared catalog and publishes notifications through a reconnecting event stream. The tree reuses its nodes to retain scroll position, expanded suites, and active drafts. Source-version checks preserve external edits when a draft becomes stale.

Run `pnpm dev:test-requirements` from the repository root, then open [the local app](http://127.0.0.1:3110/). Node.js 24 provides TypeScript execution for the local server.

The tree collects source descriptions through the `TestFrameworkAdapter` interface. `PlaywrightAdapter`, `VitestAdapter`, `GodotAdapter`, and `CppAdapter` translate their testing systems into a shared requirement model. Jest and Node adapters cover the repository's additional JavaScript tests. The JavaScript adapters share an AST reader through composition.

Vitest and Playwright entries use nested `describe` titles and `it` or `test` titles. Parameterized declarations appear once with their template description. Computed descriptions appear as source-backed entries and support editing through their source files. The overview describes collected test declarations.

Godot entries use assertion messages and test function descriptions. A test function with helper assertions can have a `## Requirement: ...` annotation. C++ supports doctest and Catch2 `TEST_CASE`, fixture cases, `SCENARIO`, `SUBCASE`, and `SECTION`, plus GoogleTest `TEST`, `TEST_F`, `TEST_P`, and `TYPED_TEST`. GoogleTest prose belongs in a `// Requirement: ...` annotation, preserving the test identifiers.

Revise a requirement description and press **Enter**. Saving replaces the source description or requirement annotation and refreshes the catalog. Test implementation and application code stay as they are. Description editing works independently of test-runner configuration.

## Discovery and validation configuration

Optional repository-root `test-requirements.config.json` selects discovery roots and supplies validation metadata in catalog responses. Roots belong inside the repository. Validation recipes match path prefixes, with the most specific prefix taking precedence. Commands use argument arrays with their declared repository-relative `cwd`, or the recipe's `path` directory. Description saves use the source range and version checks.

```json
{
  "roots": ["apps", "packages", "scripts"],
  "validation": [
    {
      "path": "apps/native",
      "commands": [
        { "command": "cmake", "arguments": ["--build", "build"], "cwd": "apps/native" },
        { "command": "ctest", "arguments": ["--test-dir", "build", "--output-on-failure"], "cwd": "apps/native" }
      ]
    }
  ]
}
```

The catalog includes configured C++ build and test recipes, Godot runner metadata, and JavaScript runner metadata from the owning project. These commands belong to catalog metadata; the requirement editor performs source-text updates.

Run `pnpm --filter @sanjo/test-requirements test`, `typecheck`, and `build` for development checks. Unit tests use Vitest and exercise the adapters, catalog, live updates, and description saves through their public APIs.
