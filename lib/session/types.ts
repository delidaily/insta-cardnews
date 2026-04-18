export type StepNumber = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export interface SessionState {
  session_id: string;
  current_step: StepNumber;
  completed_steps: StepNumber[];
  updated_at: string;
}

export interface ContextJson {
  session_id: string;
  topic: string;
  key_points: string[];
  tone: string;
  target_audience: string;
}

export interface ThumbnailCopyJson {
  lines: [string, string, string];
  attempts: number;
  rule_passed: boolean;
  critic_score: number;
  score_reason: string;
  human_edited: boolean;
  escalated?: boolean;
}

export interface BodyCardsJson {
  card_02: { subtitle: string; body: string };
  card_03: { subtitle: string; body: string };
  card_04: { subtitle: string; body: string };
  card_05: { cta_main: string; cta_sub: string; account: string };
}

export type ImageSource = 'user_upload' | 'none' | 'color';

export interface ImageCard {
  source: ImageSource;
  selected: string | null;
  color?: string;
}

export interface ImagesJson {
  preset: 'preset-A' | 'preset-B' | 'preset-C';
  card_01: ImageCard;
  card_02: ImageCard;
  card_03: ImageCard;
  card_04: ImageCard;
  card_05: ImageCard;
}

export interface SessionResult {
  session_id: string;
  created_at: string;
  thumbnail_attempts: number;
  thumbnail_final_score: number;
  preset: string;
  image_sources: Record<string, ImageSource>;
  output_files: string[];
}
