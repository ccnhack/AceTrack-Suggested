export const generateFeed = (tournaments = [], players = [], matchmaking = [], limit = 20) => {
  const feed = [];
  const now = new Date();

  // 1. Matches completed recently
  matchmaking.forEach(m => {
    if (m.status === 'Completed' && m.endTime) {
      feed.push({
        id: `feed_match_${m.id}`,
        type: 'match_result',
        timestamp: new Date(m.endTime).getTime(),
        data: m,
      });
    }
  });

  // 2. Tournaments completed recently
  tournaments.forEach(t => {
    if (t.status === 'completed' && t.date) {
      // Assuming tournament ended recently (if date is past)
      const tDate = new Date(t.date);
      if (tDate <= now) {
        feed.push({
          id: `feed_tournament_${t.id}`,
          type: 'tournament_result',
          timestamp: tDate.getTime(), // Ideally end time, using date as proxy
          data: t,
        });
      }
    } else if (t.status === 'upcoming' && t.date) {
        // Tournament announced
        const createdAt = new Date(t.date); // Using date as proxy since createdAt might be missing
        createdAt.setDate(createdAt.getDate() - 7); // Fake creation date 7 days before tournament
        if (createdAt <= now) {
            feed.push({
                id: `feed_tournament_new_${t.id}`,
                type: 'tournament_new',
                timestamp: createdAt.getTime(),
                data: t,
            });
        }
    }
  });

  // 3. New Player registrations (Mocked from join date, assuming users don't have createdAt, we can just use their ID as a proxy or just skip if no date)
  // For now, let's just use matches and tournaments to populate the feed.

  // Sort chronologically (newest first)
  feed.sort((a, b) => b.timestamp - a.timestamp);

  return feed.slice(0, limit);
};
