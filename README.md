# Match Cut

A film scholar's instrument for 7,139 annotated music videos, built so a person
and their agent can use it at the same time.

In film grammar a *match cut* joins two shots because they resemble each other.
That is the whole idea here: move through an archive by what things look like and
by why one work leads to another, rather than by keyword.

## Why this needs WebMCP

Music discovery is usually a search box wired to a recommender. An agent handed
that can only type into the box. The interesting tools are the ones a search box
cannot express:

- **`find_by_look`** — every video carries a measured visual fingerprint: motion,
  brightness, warmth, saturation, contrast, average shot length, cut count. So the
  agent can answer *"find something shot like this but from a different era"*.
  Values are banded against the archive's own distribution, so "high motion" means
  high for this corpus, not an arbitrary number.
- **`follow_connection`** — 49,753 connections, each carrying the **reason** it
  exists: a shared director, era, movement or tag. Not a cosine score. The agent
  can say *why* one video leads to the next, because the edge states it.
- **`get_annotation`** — real research prose per video: cultural context,
  curatorial assessment, genre significance, era, director biography. The tool
  description tells the agent to quote it rather than invent facts.

The page and the agent share one screen. Every tool maps onto something a person
can also do in the UI, so nothing the agent does happens off-screen, and every
call it makes is printed in the activity panel with its arguments and result.

## The tally light

In a television studio the tally light shows which camera is live. Here amber is
reserved for a real agent acting on the page. When no agent is attached, the light
is blue and reads "demo" — the starter lines run the same tools locally so the app
demonstrates itself in an ordinary browser, without ever pretending an agent is
present.

## Tools

| Tool | What it does |
|---|---|
| `search_archive` | Text plus facets: director, narrative type, visual era, year range, tier |
| `find_by_look` | Search by visual grammar, or match the look of a given video |
| `follow_connection` | Walk the connection graph, with reasons |
| `play` | Put a video on the shared screen |
| `now_playing` | Read what is on screen and how far in |
| `get_annotation` | Fetch the research text for a video |
| `queue_set` | Programme a run of videos with a title |
| `archive_stats` | Orient: size, range, vocabularies |

## Running it

    python3 -m http.server 8901

Then open `http://localhost:8901`. Append `?demo=0` through `?demo=4` to run one of
the scripted lines on load.

Test with an agent in ChatGPT's in-app browser, which supports WebMCP directly, or
in Chrome with the WebMCP flag enabled.

## Data

`data/index.json` boots the app: one record per video with facets, tags, technique
and subculture lists, the visual fingerprint, and its connections.
`data/detail/NNN.json` holds the research prose, sharded 128 ways by FNV-1a of the
video id so a lookup fetches roughly 160KB rather than 20MB. Both are generated:

    python3 scripts/build_corpus.py

The source archive (`data/cards.json`) is not served and is not in the repository.
