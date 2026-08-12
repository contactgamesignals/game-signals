export type DashboardGame = {
  id: string;
  title: string;
  steam_url: string | null;
  enabled: boolean;
  twitch_game_id: string | null;
  youtube_last_scanned_at: string | null;
  twitch_last_scanned_at: string | null;
  created_at: string;
};

export type DashboardMention = {
  id: string;
  game_id: string;
  platform: "youtube" | "twitch" | "kick";
  creator_name: string;
  title: string;
  url: string;
  thumbnail_url: string | null;
  viewer_count: number | null;
  view_count: number | null;
  published_at: string | null;
  detected_at: string;
  last_seen_at: string | null;
  signal_score: number;
  games: { title: string } | { title: string }[] | null;
};
