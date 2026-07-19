// Sends a push notification via ntfy.sh when a game is finalized, so the admin
// gets a phone alert confirming the game exists (no scavenging for missing
// post-games later). Uses the same ntfy setup as the sign-out app.
//
// Set your topic here — this is the ntfy topic you subscribe to on your phone.
const NTFY_TOPIC = "crest-league-games"; // change to your actual topic

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

    const title = `✅ Game finalized: ${league} ${sport} ${level}`;
    const body = `${sideA} vs ${sideB}  —  ${score}`;

    await fetch(`https://ntfy.sh/${NTFY_TOPIC}`, {
      method: "POST",
      headers: { "Title": title, "Tags": "trophy", "Priority": "default" },
      body,
    });
  } catch {
    // Never let a notification failure affect the finalize flow.
  }
}