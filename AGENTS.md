# Project Roadmap & Future Intelligence

## 🚀 Upcoming Capabilities
### Universal MCP Bridge (Planned)
- **Local Mirroring**: Auto-discovery of Claude Desktop MCP configurations (`%APPDATA%/Claude/claude_desktop_config.json`).
- **Cloud Sync Portal**: UI for uploading and persisting MCP configs to the database for GitHub/Vercel deployments.
- **Dynamic Toolkit**: AI Assistant dynamically fetches available tools from the unified MCP bridge.

---

# Next.js Agent Rules
<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# AI Configuration Rules
<!-- BEGIN:ai-config-rules -->
### 🔒 Locked Models
- **Primary**: `gemini-3.1-flash-lite-preview`
- **Secondary**: `gemini-2.5-flash`
- **Safety Net**: `gemini-1.5-flash` (Added to prevent 429/503 errors from breaking core features)

### ⚠️ IMPORTANT: Change Policy
- **DO NOT** change these models or the fallback order in `src/lib/gemini.ts` without explicit user approval.
- High-priority preference over "stability" or "standard" models.
<!-- END:ai-config-rules -->
