// Strip common emoji ranges from agent output. Models sometimes ignore the
// EMOJI POLICY in the system prompt; this is the second-layer guarantee.
const EMOJI_REGEX =
  /[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]|[\u{1F000}-\u{1F02F}]|[\u{1F0A0}-\u{1F0FF}]|[\u{1F100}-\u{1F64F}]|[\u{1F910}-\u{1F96B}]|[\u{1F980}-\u{1F9E0}]|[\u{1FA00}-\u{1FAFF}]|[\u{1F1E0}-\u{1F1FF}]|️/gu;

export function stripEmojis(s: string): string {
  if (!s) return s;
  return s
    .replace(EMOJI_REGEX, "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/^\s+|\s+$/g, (m) => (m.includes("\n") ? m : ""))
    .trim();
}
