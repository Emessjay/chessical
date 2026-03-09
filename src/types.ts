export interface OpeningLine {
  id: string;
  name: string;
  eco?: string;
  moves: string[];
}

export interface Opening {
  id: string;
  name: string;
  eco?: string;
  moves?: string[];
  lines?: OpeningLine[];
}
