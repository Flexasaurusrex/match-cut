# WebMCP Challenge

- Registration opened Aug 25 2026, 12pm PT
- **Submission deadline Sept 3 2026, 1pm PT**
- Winners Sept 23
- Submit via Devpost: description, working live app, code repo, demo video
- Judged: usefulness, originality, execution, thoughtful use of WebMCP, quality of
  the human-agent experience
- Test surface: ChatGPT in-app browser (WebMCP native) or Chrome behind the flag

## API

`document.modelContext.registerTool({name, description, inputSchema, execute})`
`document.modelContext.getTools()` / `executeTool()` / `"toolchange"` event

## Corpus

- RAD: 7,138 annotated cards. `cultural_context`, `director`, and `conns`
  (curated connections, ~7 per card, each with a REASON). This is the moat.
- MTV Rewind: 100,788 indexed videos across 103 channels for breadth.
