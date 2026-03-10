const CHESS_COM_USERNAME_KEY = "chessical_chesscom_username";

function hasStorage(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

export function getChessComUsername(): string | null {
  if (!hasStorage()) return null;
  try {
    const value = window.localStorage.getItem(CHESS_COM_USERNAME_KEY);
    return value === "" ? null : value;
  } catch {
    return null;
  }
}

export function setChessComUsername(username: string): void {
  if (!hasStorage()) return;
  try {
    const trimmed = username.trim();
    if (trimmed) {
      window.localStorage.setItem(CHESS_COM_USERNAME_KEY, trimmed);
    } else {
      window.localStorage.removeItem(CHESS_COM_USERNAME_KEY);
    }
  } catch {
    // ignore
  }
}
