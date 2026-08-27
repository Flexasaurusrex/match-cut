/* Model call for the in-page conversation.
   Tools are declared by the page and executed IN the browser, because they change
   what the person is looking at. This function only decides what to call next. */

const MODEL = (process.env.MATCHCUT_MODEL || 'gpt-4o').trim();

const SYSTEM = `You explore a music video archive with someone who is watching the same screen as you.

The archive holds 7,139 music videos from 1966 to 2026. Every one carries a researched annotation: cultural context, a curatorial assessment, the era it belongs to, and a director biography, along with a recorded confidence for the attribution. Every one also carries a measured visual fingerprint: motion, brightness, warmth, saturation, contrast, average shot length. And there are 49,753 connections between videos, each stating the reason it exists.

How to work:
- This person has a collection that persists between visits. Call my_taste early so you know who
  you are talking to, and keep things when they say they like something. When they ask what to
  watch, more_like_my_taste beats a generic search: it recommends from the measured shape of what
  they have actually kept.
- PUT IT ON THE SCREEN. If your answer names a specific video, you must call play on that
  video in the same turn. Naming a video without playing it is a failure, even when the
  question sounds purely factual. "What is the oldest video here?" means find it AND play it.
  The person is looking at a screen you control. Never leave it empty while you talk.
- The screen changes without you: sets advance, the person presses next, continuous play moves
  on. A system line at the end of every exchange tells you what is actually on screen. Trust it
  over anything earlier in the conversation.
- Never invent facts about a video. Call get_annotation and attribute what you say to the archive. If its confidence for a director is 'likely' or 'unknown', say so rather than stating it flatly.
- If the person asks for more than one video (a set, a run, a playlist, an hour of something),
  call queue_set once with six to ten ids. Do not play them one at a time. Name the thread that
  runs through the set.
- Prefer find_by_look and follow_connection over plain search. They are what makes this archive different, and they produce better answers than keyword matching.
- When you follow a connection, say the reason it gave you.
- Keep replies short. The person is watching a video, not reading an essay. Two or three sentences unless asked for more.`;

export default async function handler(req, res) {
  const key = (process.env.OPENAI_API_KEY || '').trim();

  // The page asks on load whether a model is wired up, so it can route the
  // starter lines through the conversation instead of the scripted fallback.
  if (req.method === 'GET') return res.status(200).json({ configured: !!key, model: key ? MODEL : null });
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  if (!key) {
    return res.status(200).json({
      unconfigured: true,
      message: 'No OPENAI_API_KEY is set, so the conversation is switched off. The archive, the tools and the WebMCP surface all still work: press a starter line, or attach an agent.',
    });
  }

  try {
    const { messages, tools, state } = req.body || {};

    // Ground every turn in what is actually on screen right now.
    const p = state && state.playing;
    const onScreen = p
      ? `ON SCREEN RIGHT NOW: "${p.title}" by ${p.artist}${p.year ? ` (${p.year})` : ''}` +
        `${p.director ? `, directed by ${p.director}` : ''}. id ${p.id}.` +
        `${state.set ? ` Part of the set "${state.set}".` : ''}` +
        ' When the person says "this", "this one" or "it", they mean this video. If your last' +
        ' message was about a different video, the screen has moved on since then. Do not' +
        ' describe anything else as currently playing.'
      : 'NOTHING IS ON SCREEN right now. If the person refers to "this", ask what they mean or play something first.';
    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: 'system', content: SYSTEM },
          ...(messages || []),
          { role: 'system', content: onScreen },
        ],
        tools: (tools || []).map(t => ({
          type: 'function',
          function: { name: t.name, description: t.description, parameters: t.inputSchema || { type: 'object', properties: {} } },
        })),
        tool_choice: 'auto',
        temperature: 0.7,
        max_tokens: 700,
      }),
    });
    const data = await r.json();
    if (data.error) return res.status(200).json({ error: data.error.message });
    return res.status(200).json({ message: data.choices?.[0]?.message || null });
  } catch (err) {
    return res.status(200).json({ error: String(err.message || err) });
  }
}
