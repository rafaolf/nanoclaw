---
name: channel-routing
description: Enforce channel-based access control. Check BEFORE executing any capability-specific action. Redirect users to the correct channel when a request is outside scope.
---

# Channel Routing — Capability Access Control

You operate in a multi-channel environment where each channel has specific capabilities. **Before acting on any request**, check whether the current channel is authorized for that capability.

## Enforcement model

Access control is enforced at **two levels**:

1. **Infrastructure level (hard)** — Credentials and file mounts are scoped per-group based on `capabilities.json → credentialScopes`. If your group doesn't have the CRM capability, the HubSpot MCP server literally does not start — the tools don't exist. You cannot bypass this.

2. **Prompt level (soft)** — Even for general-purpose requests that don't require specific tools, you should respect channel boundaries and redirect users to the right channel.

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

> This type of request is handled in the **{capability display name}** channel. Please send your question there.

Use the `groupDirectory` in the config to map group folder names to user-friendly display names.

## If no capability matches

The request is general-purpose — proceed normally. Only restrict requests that clearly match a defined capability's keywords.

## Capability-scoped global memory

Authorized channels also have a private global memory tier at `/workspace/global-{capability}/` (e.g., `/workspace/global-crm/` for the CRM channel). This directory is only mounted in containers that hold the capability — it is physically absent in all other channels' containers.

Use these tiers to store capability-specific shared context (templates, baselines, playbooks). Do NOT reference or surface content from a tier your channel does not hold.

## Rules

- **Always check before acting** — even if you technically have the tools, respect the channel boundary. Do not make partial tool calls before redirecting.
- **Never leak data across channels** — if you have capability-scoped memory (`/workspace/global-crm/`, etc.), treat it as internal to that channel only.
- **Be helpful in the redirect** — tell the user exactly which channel to go to, don't just say "not allowed".
- **Main channel bypass** — the main channel (check `groupDirectory` for the main entry) has full access to all capabilities for administrative purposes.

## Customizing capabilities.json

The `capabilities.json` file controls which groups can access which capabilities:

- **capabilities**: Each key defines a capability with `name`, `description`, `allowedGroups` (list of group folder names), and `keywords` (trigger words).
- **credentialScopes**: Maps each capability to the credentials it requires (`envKeys`, `needsServiceAccount`, `needsGmail`). Only groups holding a capability receive its credentials — this is enforced by the container runner at startup.
- **groupDirectory**: Maps group folder names to user-friendly display names used in redirect messages.

Edit `container/skills/channel-routing/capabilities.json` to match your channel setup.
