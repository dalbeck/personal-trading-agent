import type { ResearchProvider } from "./types";

/** The default provider: research is disabled. Zero network, always null. */
export const offProvider: ResearchProvider = {
  name: "off",
  async research() {
    return null;
  },
};
