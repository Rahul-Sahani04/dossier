import { describe, expect, it, vi } from "vitest";

import { MockProvider } from "@/lib/ai/providers/mock";

import { WRITE_DOCUMENTS_STEPS } from "./application-steps";
import { writeDocumentsJob } from "./write-documents";

const provider = vi.hoisted(() => ({ current: undefined as unknown, roles: [] as string[] }));
vi.mock("@/lib/ai", () => ({ getAiProvider: async (role = "primary") => { provider.roles.push(role); return provider.current; } }));
vi.mock("@/lib/ai/task-options", () => ({ loadTaskOptions: async () => ({ creativity: "BALANCED", strict: true, language: null }) }));
vi.mock("@/lib/profile-data", async () => {
  const { demoProfile } = await import("@/lib/demo-profile");
  return { loadProfile: async () => demoProfile() };
});
vi.mock("./runner", () => ({ defineJob: <T,>(definition: T) => definition }));

describe("writeDocumentsJob (E7-6)", () => {
  it("tailors the resume, then writes the letter, naming each step", async () => {
    provider.roles = [];
    provider.current = new MockProvider({
      reply: (call) =>
        call.json?.name === "tailored_resume"
          ? { summary: "Designer at Google.", roles: [], projects: [], skills: ["Figma"], education: [] }
          : { recipient: "Ledgerly · Hiring team", greeting: "Dear Ledgerly team,", paragraphs: [{ label: "Opening", text: "I'd love to join Ledgerly." }], signOff: "Warm regards," },
    });
    const steps: string[] = [];
    const extracted = {
      title: "Designer · Ledgerly", company: "Ledgerly", role: "Designer", location: null, mode: null, salary: null, deadline: null,
      requirements: [], asksForReferences: false, language: "English",
    };
    const result = await writeDocumentsJob.run(
      { readJobId: "read-job", posting: "Ledgerly is hiring.", extracted, match: { items: [] }, tone: "WARM", note: "" },
      { id: "test-job", step: async (name) => void steps.push(name), signal: new AbortController().signal },
    );
    expect(steps).toEqual(WRITE_DOCUMENTS_STEPS.slice(0, 2));
    expect(result.resumeWith).toBe("tailor-resume@7");
    expect(result.letterWith).toBe("write-cover-letter@5");
    // Strict mode: the fact guard marks what the profile doesn't back.
    expect(result.resume[0]).toMatchObject({ id: "summary", unverified: ["Google"] });
    expect(result.letter.map((unit) => unit.id)).toEqual(["recipient", "greeting", "paragraph:1", "sign-off"]);
    expect(provider.roles).toEqual(["primary"]);
  });

  it("uses the lower-cost agent model when an agent draft asks for it", async () => {
    provider.roles = [];
    provider.current = new MockProvider({
      reply: (call) =>
        call.json?.name === "tailored_resume"
          ? { summary: "Designer.", roles: [], projects: [], skills: [], education: [] }
          : { recipient: "Ledgerly", greeting: "Dear team,", paragraphs: [{ label: "Opening", text: "Hello." }], signOff: "Regards," },
    });
    const extracted = {
      title: "Designer · Ledgerly", company: "Ledgerly", role: "Designer", location: null, mode: null, salary: null, deadline: null,
      requirements: [], asksForReferences: false, language: "English",
    };
    await writeDocumentsJob.run(
      { readJobId: "agent-job", posting: "Ledgerly is hiring.", extracted, match: { items: [] }, tone: "WARM", note: "", aiRole: "agent" },
      { id: "agent-job", step: async () => {}, signal: new AbortController().signal },
    );
    expect(provider.roles).toEqual(["agent"]);
  });
});
