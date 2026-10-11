import { describe, expect, it } from "vitest";
import { GodotAdapter } from "./GodotAdapter.ts";
import type { SourceContext } from "../model.ts";

const context = (source: string): SourceContext => ({ source, path: "apps/game/test_menu.gd", absolutePath: "/repo/apps/game/test_menu.gd", projectDirectory: "/repo/apps/game", project: "apps/game" });

describe("Godot requirement adapter", () => {
  it("reads multiline assertion messages beneath their test function", () => {
    const source = `func test_menu():
  # assert(false, "comment example")
  assert(
    retrieve_menu(1, 2).visible,
    "Opening the menu shows activities"
  )
  assert(count == 2, "The menu offers two activities")`;
    const requirements = new GodotAdapter().discover(context(source));
    expect(requirements.map(item => item.title)).toEqual(["Opening the menu shows activities", "The menu offers two activities"]);
    expect(requirements[0].suites).toEqual(["menu"]);
  });

  it("uses requirement annotations for test functions with identifier descriptions", () => {
    const requirements = new GodotAdapter().discover(context(`## Requirement: The player joins the session
func test_player_join():
  verify_join()

func test_player_leave():
  verify_leave()`));
    expect(requirements[0]).toMatchObject({ title: "The player joins the session", insertAnnotation: false });
    expect(requirements[1]).toMatchObject({ title: "player leave", insertAnnotation: true });
  });

  it("keeps computed assertion messages visible as source-backed entries", () => {
    expect(new GodotAdapter().discover(context(`func test_names():
  assert(valid, "Valid name: %s" % name)`))[0]).toMatchObject({ editable: false });
  });
});
