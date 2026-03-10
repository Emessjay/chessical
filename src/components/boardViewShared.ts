export type ViewMode = "view" | "practice" | "analysis";

export function formatMoveList(moves: string[]): string {
  if (moves.length === 0) return "";

  const parts: string[] = [];
  for (let i = 0; i < moves.length; i++) {
    const token = moves[i]?.trim();
    if (!token) continue;

    if (i % 2 === 0) {
      parts.push(`${Math.floor(i / 2) + 1}. ${token}`);
    } else {
      parts.push(token);
    }
  }
  return parts.join(" ").trim();
}

