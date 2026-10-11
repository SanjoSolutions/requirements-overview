import { describe, expect, it } from "vitest";
import { CppAdapter } from "./CppAdapter.ts";
import type { SourceContext } from "../model.ts";

const context = (source: string): SourceContext => ({ source, path: "apps/native/tests/session.cpp", absolutePath: "/repo/apps/native/tests/session.cpp", projectDirectory: "/repo/apps/native", project: "apps/native" });

describe("C++ requirement adapter", () => {
  it("groups doctest cases and subcases by their description strings", () => {
    const requirements = new CppAdapter().discover(context(`TEST_SUITE("Sessions") {
TEST_CASE("keeps the selected session") { SUBCASE("after a reload") { CHECK(valid); } }
}`));
    expect(requirements.map(item => [item.title, item.suites])).toEqual([
      ["keeps the selected session", ["Sessions"]], ["after a reload", ["Sessions", "keeps the selected session"]],
    ]);
  });

  it("reads Catch2 fixture descriptions and raw string sections", () => {
    const requirements = new CppAdapter().discover(context(`TEST_CASE_METHOD(Session, "supports switching", "[session]") {
SECTION(R"title(after "reload")title") { REQUIRE(valid); }
}`));
    expect(requirements.map(item => item.title)).toEqual(["supports switching", 'after "reload"']);
  });

  it("provides editable prose annotations while preserving GoogleTest identifiers", () => {
    const requirements = new CppAdapter().discover(context(`// Requirement: Keeps the selected session
TEST_F(Session, KeepsSelection) { EXPECT_EQ(1, 1); }
TEST(Session, OpensSettings) { EXPECT_TRUE(true); }`));
    expect(requirements[0]).toMatchObject({ title: "Keeps the selected session", suites: ["Session"], insertAnnotation: false });
    expect(requirements[1]).toMatchObject({ title: "Opens Settings", insertAnnotation: true, syntax: "annotation" });
  });
});
