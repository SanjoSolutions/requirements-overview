# Test requirements

Local requirement editor built with TypeScript, Vite, and Bootstrap.

Select a project to view its complete requirement outline. Headings use the `describe` text, and nested `describe` blocks preserve their hierarchy. Test descriptions appear beneath their suite headings. Hover over a test or focus its row to reveal the icon on the right, then open its source line in VS Code. Source paths and framework details appear in the requirement editor. Search and framework filters refine the selected project; the outline export uses the current view.

Run `pnpm dev:test-requirements` from the repository root, then open [the local app](http://127.0.0.1:3110/). Node.js 24 provides TypeScript execution for the local server.

The tree collects source descriptions through the `TestFrameworkAdapter` interface. `PlaywrightAdapter`, `VitestAdapter`, `GodotAdapter`, and `CppAdapter` translate their testing systems into a shared requirement model. Jest and Node adapters cover the repository's additional JavaScript tests. The JavaScript adapters share an AST reader through composition.

Vitest and Playwright entries use nested `describe` titles and `it` or `test` titles. Parameterized declarations appear once with their template description. Computed descriptions appear as source-backed entries and support editing through their source files. The overview describes collected test declarations; execution results belong to agent tasks.

Godot entries use assertion messages and test function descriptions. A test function with helper assertions can have a `## Requirement: ...` annotation. C++ supports doctest and Catch2 `TEST_CASE`, fixture cases, `SCENARIO`, `SUBCASE`, and `SECTION`, plus GoogleTest `TEST`, `TEST_F`, `TEST_P`, and `TYPED_TEST`. GoogleTest prose belongs in a `// Requirement: ...` annotation, preserving the test identifiers.

Select a requirement, revise its description, and choose **Preview task** or **Apply with agent**. Applying writes the description to its source and starts the locally installed Codex CLI with a workspace-write sandbox. The task supplies the original and revised descriptions, source location, and validation commands. The agent updates the test and affected application code. The server independently runs validation and checks for an active matching test with an updated implementation. Task logs and results remain under the ignored `.state/` directory. A pending task keeps its working-tree changes available for review.

The local server runs one agent task at a time. **Stop task** terminates its process tree. Refresh the tree after editing test files elsewhere. The CLI uses its existing local configuration. `REQUIREMENTS_CODEX_EXECUTABLE` can select a native CLI executable.

## Discovery and validation configuration

Optional repository-root `test-requirements.config.json` selects discovery roots and validation recipes. Roots belong inside the repository. Validation recipes match path prefixes, with the most specific prefix taking precedence. Commands use argument arrays and run through direct process execution. Recipe commands run in their declared repository-relative `cwd`, or the recipe's `path` directory.

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

Configure a C++ build and test recipe for each native project. The Godot adapter uses the project's `tests/run_tests.py` runner when present; other Godot test systems use an explicit recipe. JavaScript adapters resolve the installed runner from the owning project and validate the selected test file. Recipes can select alternate Vitest configurations or project-specific prerequisites.

Run `pnpm --filter @sanjo/test-requirements test`, `typecheck`, and `build` for development checks. Unit tests use Vitest and exercise the adapters, catalog, and agent workflow through their public APIs.
