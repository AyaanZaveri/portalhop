<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Browser Automation

Use the `agent-browser` skill for browser automation, screenshots, scraping, and web app testing.

Core workflow:
1. `agent-browser open <url>`
2. `agent-browser snapshot -i`
3. Interact with refs like `@e1`, `@e2`
4. Re-run `snapshot -i` after page changes

If a site blocks automation with a bot challenge, try a first-party public endpoint or a less protected public page before declaring the task blocked.
