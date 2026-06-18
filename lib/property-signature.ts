export function propertySignature(propertyIds: number[]): string {
  if (propertyIds.length === 0) return "none";
  return [...propertyIds].sort((a, b) => a - b).join(",");
}

export const ALL_AGENT_ID = "all";
export const VALID_AGENT_IDS = ["maya", "arjun", "priya", "kabir", "raavi", ALL_AGENT_ID];

export function isValidAgentId(id: string): boolean {
  return VALID_AGENT_IDS.includes(id);
}
