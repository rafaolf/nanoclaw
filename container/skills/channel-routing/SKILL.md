---
name: channel-routing
description: Enforce channel-based access control. Check BEFORE executing any capability-specific action. Redirect users to the correct channel when a request is outside scope.
---

# Channel Routing — Capability Access Control

You operate in a multi-channel environment where each channel has specific capabilities. **Before acting on any request**, check whether the current channel is authorized for that capability.

## How to check

1. Read the capabilities config:

```bash
cat /home/node/.claude/skills/channel-routing/capabilities.json
```

2. Identify your current group from the `groupFolder` field in your input (also visible as the workspace folder name).

3. Match the user's request against `capabilities[].keywords`. If a match is found, check whether your `groupFolder` appears in that capability's `allowedGroups`.

## If the request IS allowed

Proceed normally.

## If the request is NOT allowed

Do NOT attempt to fulfill the request. Instead, politely redirect:

> This type of request is handled in the **{capability.name}** channel. Please send your question there — I'll be happy to help!

Use the `groupDirectory` in the config to map group folder names to user-friendly channel names.

## If no capability matches

The request is general-purpose — proceed normally. Only restrict requests that clearly match a defined capability's keywords.

## Rules

- **Always check before acting** — even if you technically have the tools, respect the channel boundary.
- **Never leak data across channels** — if you know something from another channel's context, do not share it.
- **Be helpful in the redirect** — tell the user exactly which channel to go to, don't just say "not allowed".
- **Main channel (whatsapp_main) has full access** — the main channel can query any capability for administrative purposes.
