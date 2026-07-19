const db = require('./db'); // your existing sqlite3/better-sqlite3 connection

const XP_PER_INTERVIEW = 50;
const XP_PER_MODE_BONUS = { explain: 10, interview: 20, both: 30 };

function xpForLevel(level) {
  // simple curve: 100, 250, 450, 700... (increasing gap)
  return 100 * level + 50 * level * (level - 1);
}

function getOrCreateStats(userId) {
  let stats = db.prepare('SELECT * FROM user_stats WHERE user_id = ?').get(userId);
  if (!stats) {
    db.prepare('INSERT INTO user_stats (user_id) VALUES (?)').run(userId);
    stats = db.prepare('SELECT * FROM user_stats WHERE user_id = ?').get(userId);
  }
  return stats;
}

function updateStreak(stats) {
  const today = new Date().toISOString().slice(0, 10);
  const last = stats.last_interview_date;

  if (last === today) return stats; // already counted today

  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  let newStreak;

  if (last === yesterday) {
    newStreak = stats.current_streak + 1;
  } else {
    newStreak = 1; // streak broken or first ever
  }

  const longest = Math.max(newStreak, stats.longest_streak);

  db.prepare(`
    UPDATE user_stats
    SET current_streak = ?, longest_streak = ?, last_interview_date = ?
    WHERE user_id = ?
  `).run(newStreak, longest, today, stats.user_id);

  return { ...stats, current_streak: newStreak, longest_streak: longest, last_interview_date: today };
}

function awardXP(userId, mode) {
  let stats = getOrCreateStats(userId);
  stats = updateStreak(stats);

  const gained = XP_PER_INTERVIEW + (XP_PER_MODE_BONUS[mode] || 0);
  let newXp = stats.xp + gained;
  let newLevel = stats.level;

  while (newXp >= xpForLevel(newLevel)) {
    newLevel++;
  }

  db.prepare('UPDATE user_stats SET xp = ?, level = ? WHERE user_id = ?')
    .run(newXp, newLevel, userId);

  const leveledUp = newLevel > stats.level;

  checkAndAwardBadges(userId, { ...stats, xp: newXp, level: newLevel });

  return {
    xpGained: gained,
    totalXp: newXp,
    level: newLevel,
    leveledUp,
    streak: stats.current_streak
  };
}

const BADGE_RULES = [
  { code: 'first_interview', name: 'First Steps', check: (s, count) => count >= 1 },
  { code: 'five_interviews', name: 'Getting Serious', check: (s, count) => count >= 5 },
  { code: 'streak_3', name: '3-Day Streak', check: (s) => s.current_streak >= 3 },
  { code: 'streak_7', name: 'Week Warrior', check: (s) => s.current_streak >= 7 },
  { code: 'level_5', name: 'Level 5 Reached', check: (s) => s.level >= 5 },
];

function checkAndAwardBadges(userId, stats) {
  const count = db.prepare('SELECT COUNT(*) as c FROM interview_sessions WHERE user_id = ?')
    .get(userId).c; // adjust to your actual sessions table name

  const owned = new Set(
    db.prepare('SELECT badge_id FROM user_badges WHERE user_id = ?').all(userId)
      .map(r => r.badge_id)
  );

  for (const rule of BADGE_RULES) {
    const badge = db.prepare('SELECT id FROM badges WHERE code = ?').get(rule.code);
    if (!badge || owned.has(badge.id)) continue;
    if (rule.check(stats, count)) {
      db.prepare('INSERT INTO user_badges (user_id, badge_id) VALUES (?, ?)').run(userId, badge.id);
    }
  }
}

module.exports = { getOrCreateStats, awardXP };