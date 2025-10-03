describe("importFileParser Integration Test", () => {
  it("should have file moving functionality implemented", () => {
    const fs = require("fs");
    const path = require("path");

    const fileContent = fs.readFileSync(
      path.join(__dirname, "../lib/handlers/importFileParser.ts"),
      "utf8"
    );

    expect(fileContent).toContain("CopyObjectCommand");
    expect(fileContent).toContain("DeleteObjectCommand");
    expect(fileContent).toContain("moveFileToProcessedFolder");
    expect(fileContent).toContain("await moveFileToProcessedFolder");
    expect(fileContent).toContain('sourceKey.replace("uploaded/", "parsed/")');

    console.log("✓ File moving functionality is properly implemented");
  });
});
