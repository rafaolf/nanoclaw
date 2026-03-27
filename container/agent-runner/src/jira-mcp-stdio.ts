/**
 * Jira MCP Server for NanoClaw
 * Provides Jira Cloud REST API access to the container agent.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { errorResult } from './mcp-utils.js';

const JIRA_URL = process.env.JIRA_URL;
const JIRA_EMAIL = process.env.JIRA_EMAIL;
const JIRA_API_TOKEN = process.env.JIRA_API_TOKEN;

if (!JIRA_URL || !JIRA_EMAIL || !JIRA_API_TOKEN) {
  console.error('JIRA_URL, JIRA_EMAIL, and JIRA_API_TOKEN must all be set — Jira MCP server cannot start.');
  process.exit(1);
}

const authHeader = 'Basic ' + Buffer.from(`${JIRA_EMAIL}:${JIRA_API_TOKEN}`).toString('base64');

async function jiraRequest(path: string, method = 'GET', body?: object): Promise<unknown> {
  const url = `${JIRA_URL}/rest/api/3${path}`;
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: authHeader,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Jira API error ${res.status}: ${text}`);
  }

  return res.json();
}

const server = new McpServer({ name: 'jira', version: '1.0.0' });

server.tool(
  'jira_search',
  'Search Jira issues using JQL. Returns summary, status, assignee, priority, due date. Tip: use "sprint in openSprints()" for active sprint issues.',
  {
    jql: z.string().describe('JQL query, e.g. "project = PM AND status != Done ORDER BY updated DESC"'),
    max_results: z.number().optional().describe('Max results (default 20, max 50)'),
    fields: z.array(z.string()).optional().describe('Fields to include. Defaults to summary, status, assignee, priority, updated, duedate, issuetype'),
  },
  async ({ jql, max_results = 20, fields }) => {
    try {
      const defaultFields = ['summary', 'status', 'assignee', 'priority', 'updated', 'duedate', 'issuetype', 'project'];
      const requestedFields = fields ?? defaultFields;
      const data = await jiraRequest(
        `/search/jql?jql=${encodeURIComponent(jql)}&maxResults=${Math.min(max_results, 50)}&fields=${requestedFields.join(',')}`
      );
      return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
    } catch (err) {
      return errorResult(err);
    }
  }
);

server.tool(
  'jira_get_issue',
  'Get full details of a specific Jira issue by key (e.g. PM-42).',
  {
    issue_key: z.string().describe('Issue key, e.g. "PM-42"'),
  },
  async ({ issue_key }) => {
    try {
      const data = await jiraRequest(`/issue/${encodeURIComponent(issue_key)}`);
      return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
    } catch (err) {
      return errorResult(err);
    }
  }
);

server.tool(
  'jira_list_projects',
  'List all Jira projects accessible to the authenticated user.',
  {},
  async () => {
    try {
      const data = await jiraRequest('/project');
      return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
    } catch (err) {
      return errorResult(err);
    }
  }
);

server.tool(
  'jira_create_issue',
  'Create a new Jira issue.',
  {
    project_key: z.string().describe('Project key, e.g. "PM"'),
    summary: z.string().describe('Issue summary/title'),
    issue_type: z.string().describe('Issue type: Task, Bug, Story, Epic, etc.').default('Task'),
    description: z.string().optional().describe('Issue description (plain text)'),
    assignee_account_id: z.string().optional().describe('Assignee Jira account ID'),
    priority: z.string().optional().describe('Priority: Highest, High, Medium, Low, Lowest'),
    due_date: z.string().optional().describe('Due date in YYYY-MM-DD format'),
    parent_key: z.string().optional().describe('Parent issue key for subtasks'),
  },
  async ({ project_key, summary, issue_type, description, assignee_account_id, priority, due_date, parent_key }) => {
    try {
      const fields: Record<string, unknown> = {
        project: { key: project_key },
        summary,
        issuetype: { name: issue_type },
        ...(description && {
          description: {
            type: 'doc',
            version: 1,
            content: [{ type: 'paragraph', content: [{ type: 'text', text: description }] }],
          },
        }),
        ...(assignee_account_id && { assignee: { accountId: assignee_account_id } }),
        ...(priority && { priority: { name: priority } }),
        ...(due_date && { duedate: due_date }),
        ...(parent_key && { parent: { key: parent_key } }),
      };
      const data = await jiraRequest('/issue', 'POST', { fields });
      return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
    } catch (err) {
      return errorResult(err);
    }
  }
);

server.tool(
  'jira_update_issue',
  'Update fields of an existing Jira issue.',
  {
    issue_key: z.string().describe('Issue key, e.g. "PM-42"'),
    summary: z.string().optional().describe('New summary/title'),
    description: z.string().optional().describe('New description (plain text)'),
    assignee_account_id: z.string().optional().describe('New assignee account ID'),
    priority: z.string().optional().describe('New priority: Highest, High, Medium, Low, Lowest'),
    due_date: z.string().optional().describe('New due date in YYYY-MM-DD format'),
  },
  async ({ issue_key, summary, description, assignee_account_id, priority, due_date }) => {
    try {
      const fields: Record<string, unknown> = {};
      if (summary) fields.summary = summary;
      if (description) {
        fields.description = {
          type: 'doc',
          version: 1,
          content: [{ type: 'paragraph', content: [{ type: 'text', text: description }] }],
        };
      }
      if (assignee_account_id) fields.assignee = { accountId: assignee_account_id };
      if (priority) fields.priority = { name: priority };
      if (due_date) fields.duedate = due_date;
      await jiraRequest(`/issue/${encodeURIComponent(issue_key)}`, 'PUT', { fields });
      return { content: [{ type: 'text' as const, text: `Issue ${issue_key} updated successfully.` }] };
    } catch (err) {
      return errorResult(err);
    }
  }
);

server.tool(
  'jira_transition_issue',
  'Change the status of a Jira issue (e.g. "In Progress", "Done"). Lists available transitions if the given name is not found.',
  {
    issue_key: z.string().describe('Issue key, e.g. "PM-42"'),
    transition_name: z.string().describe('Target status name, e.g. "In Progress", "Done", "To Do"'),
  },
  async ({ issue_key, transition_name }) => {
    try {
      const result = (await jiraRequest(`/issue/${encodeURIComponent(issue_key)}/transitions`)) as {
        transitions: { id: string; name: string }[];
      };
      const match = result.transitions.find((t) => t.name.toLowerCase() === transition_name.toLowerCase());
      if (!match) {
        const available = result.transitions.map((t) => t.name).join(', ');
        return {
          content: [{ type: 'text' as const, text: `Transition "${transition_name}" not found for ${issue_key}. Available transitions: ${available}` }],
          isError: true as const,
        };
      }
      await jiraRequest(`/issue/${encodeURIComponent(issue_key)}/transitions`, 'POST', { transition: { id: match.id } });
      return { content: [{ type: 'text' as const, text: `Issue ${issue_key} transitioned to "${match.name}".` }] };
    } catch (err) {
      return errorResult(err);
    }
  }
);

server.tool(
  'jira_add_comment',
  'Add a comment to a Jira issue.',
  {
    issue_key: z.string().describe('Issue key, e.g. "PM-42"'),
    comment: z.string().describe('Comment text'),
  },
  async ({ issue_key, comment }) => {
    try {
      const data = await jiraRequest(`/issue/${encodeURIComponent(issue_key)}/comment`, 'POST', {
        body: {
          type: 'doc',
          version: 1,
          content: [{ type: 'paragraph', content: [{ type: 'text', text: comment }] }],
        },
      });
      return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
    } catch (err) {
      return errorResult(err);
    }
  }
);

server.tool(
  'jira_get_my_issues',
  'Get Jira issues assigned to the currently authenticated user, ordered by last updated.',
  {
    status: z.string().optional().describe('Filter by status, e.g. "In Progress", "To Do"'),
    limit: z.number().optional().describe('Max results (default 20)'),
  },
  async ({ status, limit = 20 }) => {
    try {
      const parts = ['assignee = currentUser()'];
      if (status) parts.push(`status = "${status}"`);
      const jql = parts.join(' AND ') + ' ORDER BY updated DESC';
      const fields = ['summary', 'status', 'priority', 'updated', 'duedate', 'issuetype', 'project'];
      const data = await jiraRequest(
        `/search/jql?jql=${encodeURIComponent(jql)}&maxResults=${Math.min(limit, 50)}&fields=${fields.join(',')}`,
      );
      return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
    } catch (err) {
      return errorResult(err);
    }
  },
);

server.tool(
  'jira_get_sprint_issues',
  'Get Jira issues in the currently active sprint(s). Optionally filter by project or status.',
  {
    project_key: z.string().optional().describe('Project key to filter by, e.g. "PM"'),
    status: z.string().optional().describe('Filter by status, e.g. "In Progress"'),
    limit: z.number().optional().describe('Max results (default 30)'),
  },
  async ({ project_key, status, limit = 30 }) => {
    try {
      const parts = ['sprint in openSprints()'];
      if (project_key) parts.push(`project = "${project_key}"`);
      if (status) parts.push(`status = "${status}"`);
      const jql = parts.join(' AND ') + ' ORDER BY rank ASC';
      const fields = ['summary', 'status', 'assignee', 'priority', 'updated', 'duedate', 'issuetype', 'project'];
      const data = await jiraRequest(
        `/search/jql?jql=${encodeURIComponent(jql)}&maxResults=${Math.min(limit, 50)}&fields=${fields.join(',')}`,
      );
      return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
    } catch (err) {
      return errorResult(err);
    }
  },
);

server.tool(
  'jira_link_issues',
  'Create a link between two Jira issues (e.g. "blocks", "is caused by", "relates to"). Use for PRD-to-epic or epic-to-story traceability.',
  {
    inward_issue_key: z.string().describe('Inward issue key (e.g. the epic), e.g. "PM-10"'),
    outward_issue_key: z.string().describe('Outward issue key (e.g. the story), e.g. "PM-42"'),
    link_type: z.string().describe('Link type name: "Blocks", "Cloners", "Duplicate", "Relates" (or custom names configured in Jira)').default('Relates'),
  },
  async ({ inward_issue_key, outward_issue_key, link_type }) => {
    try {
      await jiraRequest('/issueLink', 'POST', {
        type: { name: link_type },
        inwardIssue: { key: inward_issue_key },
        outwardIssue: { key: outward_issue_key },
      });
      return { content: [{ type: 'text' as const, text: `Linked ${inward_issue_key} → ${outward_issue_key} (${link_type}).` }] };
    } catch (err) {
      return errorResult(err);
    }
  }
);

server.tool(
  'jira_get_boards',
  'List Jira boards (Scrum/Kanban). Use to find board IDs for sprint queries.',
  {
    project_key: z.string().optional().describe('Filter by project key'),
    type: z.enum(['scrum', 'kanban']).optional().describe('Filter by board type'),
  },
  async ({ project_key, type }) => {
    try {
      const params = new URLSearchParams();
      if (project_key) params.set('projectKeyOrId', project_key);
      if (type) params.set('type', type);
      const qs = params.toString();
      // Agile REST API uses a different base path
      const url = `${JIRA_URL}/rest/agile/1.0/board${qs ? `?${qs}` : ''}`;
      const res = await fetch(url, {
        headers: {
          Authorization: authHeader,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Jira Agile API error ${res.status}: ${text}`);
      }
      const data = await res.json();
      return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
    } catch (err) {
      return errorResult(err);
    }
  }
);

server.tool(
  'jira_get_issue_links',
  'Get all links for a Jira issue (blocks, relates to, etc.). Useful for tracing dependencies.',
  {
    issue_key: z.string().describe('Issue key, e.g. "PM-42"'),
  },
  async ({ issue_key }) => {
    try {
      const data = (await jiraRequest(`/issue/${encodeURIComponent(issue_key)}?fields=issuelinks`)) as {
        fields: { issuelinks: unknown[] };
      };
      return { content: [{ type: 'text' as const, text: JSON.stringify(data.fields.issuelinks, null, 2) }] };
    } catch (err) {
      return errorResult(err);
    }
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
