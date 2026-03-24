---
name: status
description: System status and capabilities — session context, workspace mounts, installed skills, tool availability, and task snapshot. Use when the user asks for system status, what the bot can do, or runs /status or /capabilities.
---

# /status — System Status & Capabilities

Generate a read-only report of the current agent environment and capabilities.

**Main-channel check:** Only the main channel has `/workspace/project` mounted. Run:

```bash
test -d /workspace/project && echo "MAIN" || echo "NOT_MAIN"
```

If `NOT_MAIN`, respond with:
> This command is available in your main chat only. Send `/status` there.

Then stop — do not generate the report.

## How to gather the information

Run the checks below and compile results into the report format.

### 1. Session context

```bash
echo "Timestamp: $(date)"
echo "Working dir: $(pwd)"
```

### 2. Workspace and mount visibility

```bash
echo "=== Group folder ==="
ls /workspace/group/ 2>/dev/null | head -20
echo "=== Extra mounts ==="
ls /workspace/extra/ 2>/dev/null || echo "none"
echo "=== IPC ==="
ls /workspace/ipc/ 2>/dev/null
```

### 3. Installed skills

```bash
ls -1 /home/node/.claude/skills/ 2>/dev/null || echo "No skills found"
```

Each directory is an installed skill.

### 4. Tool availability

Confirm which tool families are available:

- **Core:** Bash, Read, Write, Edit, Glob, Grep
- **Web:** WebSearch, WebFetch
- **Orchestration:** Task, TaskOutput, TaskStop, TeamCreate, TeamDelete, SendMessage
- **MCP (nanoclaw):** send_message, schedule_task, list_tasks, pause_task, resume_task, cancel_task, update_task, register_group
- **MCP (integrations):** Check which integration MCP servers are available — try calling a list/search tool from each. If it errors with "unknown tool", that integration is not configured.

### 5. Container utilities

```bash
which agent-browser 2>/dev/null && echo "agent-browser: available" || echo "agent-browser: not installed"
node --version 2>/dev/null
claude --version 2>/dev/null
```

### 6. Task snapshot

Call `mcp__nanoclaw__list_tasks` to get scheduled tasks. If no tasks exist, report "No scheduled tasks."

## Report format

Present as a clean, readable message:

```
NanoClaw Status

Session:
- Channel: main
- Time: 2026-03-14 09:30
- Working dir: /workspace/group

Workspace:
- Group folder: N files
- Extra mounts: none / N directories
- IPC: active

Installed Skills:
- agent-browser, channel-routing, hubspot, slack-formatting, status
(list all found)

Tools:
- Core: available   Web: available   Orchestration: available
- MCP: nanoclaw, jira, hubspot, gdrive (list only those that respond)

Container:
- agent-browser: available / not installed
- Node: vXX.X.X
- Claude Code: vX.X.X

Scheduled Tasks:
- N active tasks / No scheduled tasks
```

Adapt based on what you actually find. Keep it concise.
