export const getReliabilityVerdict = (player) => {
  if (player.noShows > 0) return { label: 'High Risk', color: '#DC2626', bg: '#FEF2F2' };
  if (player.cancellations > 2) return { label: 'Moderate Risk', color: '#D97706', bg: '#FFFBEB' };
  if (player.matchesPlayed === 0 && player.cancellations === 0) return { label: 'New Player', color: '#2563EB', bg: '#EFF6FF' };
  return { label: 'Likely to Show', color: '#16A34A', bg: '#F0FDF4' };
};
