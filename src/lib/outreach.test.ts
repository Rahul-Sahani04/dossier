import { describe, expect, it } from "vitest";

import { firstAddress, outreachDraft } from "./outreach-draft";

describe("startup outreach", () => {
  it("chooses a published role/general address and ignores personal lookups", () => {
    expect(
      firstAddress([
        { email: "founder@example.com", label: "Person", from: "https://example.com/team", onRequest: true, foundAt: "" },
        { email: "jobs@example.com", label: "Hiring", from: "https://example.com/careers", onRequest: false, foundAt: "" },
      ]),
    ).toBe("jobs@example.com");
  });

  it("creates an editable draft without inventing a recipient or experience", () => {
    expect(outreachDraft({ company: "Acme", contactType: "Hiring", headline: "Python Developer", summary: "I build reliable services.", name: "Jane Doe" })).toEqual({
      subject: "Interest in opportunities at Acme",
      body: expect.stringContaining("I build reliable services."),
    });
  });
});
