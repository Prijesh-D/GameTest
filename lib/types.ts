export type Profile = {
  id: string;
  display_name: string;
  avatar_emoji: string;
  weekly_goal: number;
  created_at: string;
};

export type Exercise = {
  id: string;
  name: string;
  body_part: string;
  equipment: string;
  target: string;
  secondary_muscles: string[];
  instructions: string[];
  image_url: string;
  gif_url: string;
  /** "© Gym visual — https://gymvisual.com/". Must be shown wherever media is. */
  attribution: string;
};

export type Workout = {
  id: string;
  user_id: string;
  started_at: string;
  finished_at: string | null;
  notes: string | null;
};

export type WorkoutSet = {
  id: string;
  workout_id: string;
  exercise_id: string;
  set_index: number;
  weight_kg: number;
  reps: number;
  rpe: number | null;
  is_warmup: boolean;
  created_at: string;
};

export type FeedItem = {
  id: string;
  user_id: string;
  display_name: string;
  avatar_emoji: string;
  started_at: string;
  finished_at: string;
  notes: string | null;
  duration_seconds: number;
  working_sets: number;
  volume_kg: number;
  exercise_names: string[];
};

export type WeeklyStat = {
  user_id: string;
  week: string;
  sessions: number;
  volume_kg: number;
  working_sets: number;
  goal: number;
  met_goal: boolean;
};

export type LeaderboardRow = {
  user_id: string;
  display_name: string;
  avatar_emoji: string;
  sessions: number;
  volume_kg: number;
  goal_rate: number;
  streak: number;
};

export type LastPerformance = {
  performed_at: string;
  weight_kg: number;
  reps: number;
  sets: number;
};

export type Reaction = {
  id: string;
  workout_id: string;
  user_id: string;
  emoji: string;
  created_at: string;
};

export type LeaderboardPeriod = "week" | "month" | "all";
