// Sends a push notification via ntfy.sh when a game is finalized, so the admin
// gets a phone alert confirming the game exists (no scavenging for missing
// post-games later).
//
// IMPORTANT: HTTP headers must be Latin-1 only. Emojis or accented characters
// (like the é in "Derrick Rosé") in a header value make fetch throw, which is
// why notifications silently failed before. We keep headers plain ASCII and
// use ntfy's JSON body format instead, which is UTF-8 safe.

const NTFY_TOPIC = "crest-league-games";

export async function notifyGameFinalized(game, extra = {}) {
  try {
    if (!game) return;
    const norm = (s) => String(s ?? "").trim();
    const sideA = [game.team_a1 || game.team_a, game.team_a2].filter(Boolean).join(" + ");
    const sideB = [game.team_b1 || game.team_b, game.team_b2].filter(Boolean).join(" + ");
    const score = `${extra.score_a ?? game.score_a ?? 0}-${extra.score_b ?? game.score_b ?? 0}`;
    const league = norm(game.league_key || game.league_id);
    const sport = norm(game.sport);
    const level = norm(game.level);

    // JSON body format — everything travels in the UTF-8 body, no header
    // encoding problems. Emojis and accents (Derrick Rosé) are safe here.
    const payload = {
      topic: NTFY_TOPIC,
      title: `Game finalized: ${league} ${sport} ${level}`.trim(),
      message: `${sideA} vs ${sideB}\n${score}`,
      tags: ["white_check_mark"],
    };

    await fetch("https://ntfy.sh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch {
    // Never let a notification failure affect the finalize flow.
  }
}