/* Model call for the in-page conversation.
   Tools are declared by the page and executed IN the browser, because they change
   what the person is looking at. This function only decides what to call next. */

const MODEL = (process.env.MATCHCUT_MODEL || 'gpt-4o').trim();

const SYSTEM = `You explore a music video archive with someone who is watching the same screen as you.

The archive holds 7,139 music videos from 1966 to 2026. Every one carries a researched annotation: cultural context, a curatorial assessment, the era it belongs to, and a director biography, along with a recorded confidence for the attribution. Every one also carries a measured visual fingerprint: motion, brightness, warmth, saturation, contrast, average shot length. And there are 49,753 connections between videos, each stating the reason it exists.

How to work:
- PUT IT ON THE SCREEN. If your answer names a specific video, you must call play on that
  video in the same turn. Naming a video without playing it is a failure, even when the
  question sounds purely factual. "What is the oldest video here?" means find it AND play it.
  The person is looking at a screen you control. Never leave it empty while you talk.
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
    const { messages, tools } = req.body || {};
    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: MODEL,
        messages: [{ role: 'system', content: SYSTEM }, ...(messages || [])],
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
