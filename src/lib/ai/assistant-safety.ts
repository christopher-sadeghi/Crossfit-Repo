export function assistantSafety(message: string) {
  const urgent = /chest\s+(?:pain|pressure|tightness)|(?:pain|pressure|tightness)\s+in\s+(?:my|the)\s+chest|short(?:ness)?\s+of\s+breath|(?:can't|cannot|can’t)\s+breathe|head\s+injury|concussion|heart\s+palpitations|blood\s+in\s+(?:my\s+)?urine|dark\s+urine|rhabdo|faint(?:ed|ing)?/i.test(message);
  const flagged = urgent || /(?:sharp|stabbing|worsening|severe).{0,40}\bpain\b|pain\s+(?:is\s+)?(?:sharp|stabbing|worsening|severe)|dizz(?:y|iness)|light[ -]?headed|numbness|tingling|swell(?:ing|en)|(?:can't|cannot|can’t|unable to)\s+(?:bear\s+weight|put\s+weight|walk)/i.test(message);
  return { flagged, urgent };
}
