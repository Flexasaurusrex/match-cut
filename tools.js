/* ==========================================================================
   WebMCP tool surface.
   The page and the agent share one screen. These tools are exactly the moves a
   person can make in the UI, so nothing the agent does is invisible to the user.
   ========================================================================== */

const TOOLS = [
  {
    name: 'search_archive',
    description:
      'Search 7,139 scholarly annotated music videos (1966-2026) by artist, title, tag, ' +
      'technique or subculture, with optional filters. Returns matches with ids you can play. ' +
      'Use this for "find me something like X" questions.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Free text over artist, title, tags, techniques, subcultures' },
        director: { type: 'string', description: 'Filter to one director, e.g. "Chris Cunningham"' },
        narrative_type: { type: 'string', enum: ['theatrical','realism','documentary','surrealism','experimental'] },
        visual_era: { type: 'string', enum: ['vhs-aesthetic','film-70s-80s','early-digital-90s','hd-digital-2000s','4k-modern'] },
        year_from: { type: 'integer' }, year_to: { type: 'integer' },
        tier: { type: 'number', description: '1 is the most curatorially significant' },
        limit: { type: 'integer', description: 'Default 12, max 50' },
      },
    },
    run: (a) => App.search(a),
  },
  {
    name: 'find_by_look',
    description:
      'Find videos by their VISUAL GRAMMAR rather than by genre or words. Every video is ' +
      'fingerprinted for motion, brightness, warmth, saturation, contrast and average shot ' +
      'length. Use this for "something slower", "something darker and more frantic", or to ' +
      'find a video that LOOKS like another one but comes from a different era.',
    inputSchema: {
      type: 'object',
      properties: {
        like_id: { type: 'string', description: 'Match the look of this video id' },
        motion: { type: 'string', enum: ['low','medium','high'] },
        brightness: { type: 'string', enum: ['dark','medium','bright'] },
        warmth: { type: 'string', enum: ['cool','neutral','warm'] },
        pace: { type: 'string', enum: ['slow','medium','frantic'], description: 'From average shot length' },
        exclude_same_era: { type: 'boolean', description: 'With like_id, force a different visual era' },
        limit: { type: 'integer' },
      },
    },
    run: (a) => App.findByLook(a),
  },
  {
    name: 'follow_connection',
    description:
      'Traverse the archive\'s 49,753 connections. Unlike a similarity score, every edge ' +
      'states its REASON: a shared director, era, movement or tag. Use this to move sideways ' +
      'through the archive and to tell the person WHY one video leads to another.',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string', description: 'Video id to walk out from. Defaults to what is playing.' } },
    },
    run: (a) => App.connections(a),
  },
  {
    name: 'play',
    description:
      'Put a video on the screen the person is watching and start it. Call this whenever you ' +
      'name a specific video, including when answering a factual question about one. If you ' +
      'mention it, show it.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Video id from a search result' },
        note: { type: 'string', description: 'One line shown to the user explaining why you picked it' },
      },
      required: ['id'],
    },
    run: (a) => App.play(a),
  },
  {
    name: 'now_playing',
    description: 'Read what is currently on screen, including how far through it is. Call this before commenting on a video.',
    inputSchema: { type: 'object', properties: {} },
    run: () => App.nowPlaying(),
  },
  {
    name: 'get_annotation',
    description:
      'Fetch the scholarly annotation for a video: cultural context, curatorial assessment, ' +
      'genre significance, the era it sits in, and the director biography. This is the ' +
      'material to draw facts from. Do not invent facts about a video, call this instead.',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string', description: 'Defaults to what is playing' } },
    },
    run: (a) => App.annotation(a),
  },
  {
    name: 'queue_set',
    description:
      'Queue several videos as a run with a title. USE THIS for any request that asks for more ' +
      'than one video: a set, a run, a playlist, a block, an hour of something. The videos play ' +
      'through in order automatically and the running order is shown on screen, so do not play ' +
      'them one at a time. Six to ten is a good length. Say what the thread through the set is.',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        ids: { type: 'array', items: { type: 'string' } },
        note: { type: 'string', description: 'The thread running through the set' },
      },
      required: ['ids'],
    },
    run: (a) => App.queueSet(a),
  },
  {
    name: 'keep',
    description:
      'Save what is playing to the person\'s collection, with a short note on why they liked it. ' +
      'This persists in their browser between visits. Call it when they say they like something, ' +
      'want to remember it, or want more like it.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Defaults to what is playing' },
        why: { type: 'string', description: 'One line on what they liked about it, in their words if they gave you any' },
      },
    },
    run: (a) => App.keepIt(a),
  },
  {
    name: 'forget',
    description: 'Remove a video from the person\'s collection.',
    inputSchema: { type: 'object', properties: { id: { type: 'string', description: 'Defaults to what is playing' } } },
    run: (a) => App.dropIt(a),
  },
  {
    name: 'my_taste',
    description:
      'Read what this person has kept, why they kept it, and the SHAPE of it: their average ' +
      'motion, brightness, warmth, saturation, contrast and shot length, plus the narrative types, ' +
      'eras and directors they lean toward. Call this at the start of a session to know who you ' +
      'are talking to, and before recommending anything.',
    inputSchema: { type: 'object', properties: {} },
    run: () => App.myTaste(),
  },
  {
    name: 'more_like_my_taste',
    description:
      'Find videos that match the measured look of everything the person has kept, excluding what ' +
      'they already have. This is recommendation from their own collection rather than from ' +
      'popularity. Use it when they ask what they should watch.',
    inputSchema: { type: 'object', properties: { limit: { type: 'integer' } } },
    run: (a) => App.fromTaste(a),
  },
  {
    name: 'archive_stats',
    description: 'Describe what is in the archive: size, year range, directors, eras and how it was annotated. Use to orient yourself before searching.',
    inputSchema: { type: 'object', properties: {} },
    run: () => App.stats(),
  },
];

async function registerTools() {
  const ctx = document.modelContext;
  if (!ctx || !ctx.registerTool) {
    App.setAgentStatus('unavailable');
    return false;
  }
  for (const t of TOOLS) {
    await ctx.registerTool({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
      async execute(args) {
        const started = performance.now();
        let result;
        try {
          result = await t.run(args || {});
        } catch (err) {
          result = { error: String(err && err.message || err) };
        }
        App.logCall(t.name, args || {}, result, Math.round(performance.now() - started));
        return { content: [{ type: 'text', text: JSON.stringify(result) }] };
      },
    });
  }
  App.setAgentStatus('ready', TOOLS.length);
  return true;
}

window.TOOLS = TOOLS;
window.registerTools = registerTools;
