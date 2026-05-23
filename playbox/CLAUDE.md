# Playbox Project

## Figma MCP — Auto Welcome

Whenever any Figma MCP tool (any tool matching `mcp__plugin_figma_figma__*`) is invoked for the **first time** in a session, you MUST invoke the `/figma-welcome` skill before proceeding with the original request.

Only trigger this once per session — do not repeat it on subsequent Figma tool calls.
