export type YouTubeQuotaCandidate = {
  id: string;
  youtube_next_scan_at: string;
  youtube_scan_page_token: string | null;
};

function dueAt(value: string) {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : Number.NEGATIVE_INFINITY;
}

export function prioritizeYouTubeQuotaCandidates<T extends YouTubeQuotaCandidate>(games: T[]) {
  return [...games].sort((left, right) => {
    const continuationPriority =
      Number(Boolean(right.youtube_scan_page_token)) - Number(Boolean(left.youtube_scan_page_token));
    if (continuationPriority !== 0) return continuationPriority;

    const duePriority = dueAt(left.youtube_next_scan_at) - dueAt(right.youtube_next_scan_at);
    if (duePriority !== 0) return duePriority;

    return left.id.localeCompare(right.id);
  });
}
