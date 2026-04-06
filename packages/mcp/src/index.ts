#!/usr/bin/env node

/**
 * Field Network MCP Server
 *
 * Lets AI agents interact with Field Network to post bounties,
 * review submissions, and pay humans for real-world data collection.
 *
 * Auth: Set FIELD_API_URL and FIELD_API_TOKEN environment variables.
 * The token is a JWT from Field Network's auth system.
 *
 * Usage with Claude Code:
 *   npx @field-network/mcp
 *
 * Or add to claude_desktop_config.json:
 *   { "mcpServers": { "field-network": { "command": "npx", "args": ["@field-network/mcp"] } } }
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const API_URL = process.env.FIELD_API_URL || 'http://localhost:3000';
const API_TOKEN = process.env.FIELD_API_TOKEN || '';

// ---------------------------------------------------------------------------
// HTTP client
// ---------------------------------------------------------------------------

async function api(
  method: string,
  path: string,
  body?: Record<string, unknown>,
): Promise<{ ok: boolean; status: number; data: unknown }> {
  const url = `${API_URL}${path}`;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(API_TOKEN ? { Authorization: `Bearer ${API_TOKEN}` } : {}),
  };

  const res = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

// ---------------------------------------------------------------------------
// Formatters — render API responses as markdown tables
// ---------------------------------------------------------------------------

function taskTable(t: Record<string, unknown>): string {
  const loc = t.location as Record<string, unknown> | undefined;
  const tw = t.time_window as Record<string, unknown> | undefined;
  const bounty = t.bounty as Record<string, unknown> | undefined;
  const rights = t.rights as Record<string, unknown> | undefined;
  const assurance = t.assurance as Record<string, unknown> | undefined;

  const rows: [string, string][] = [
    ['Task ID', String(t.id ?? '—')],
    ['Title', String(t.title ?? '—')],
    ['Status', String(t.status ?? '—')],
    ['Template', String(t.template ?? 'geo_photo_v1')],
    ['Instructions', String(t.instructions ?? '—')],
    ['Location', loc ? `${loc.lat}, ${loc.lon} (±${loc.radius_m}m)` : '—'],
    ['Time Window', tw ? `${tw.start_iso} → ${tw.end_iso}` : '—'],
    ['Bounty', bounty ? `${bounty.amount} ${bounty.currency}` : '—'],
    ['Assurance', assurance ? `${assurance.mode}${assurance.quorum ? ` (n=${assurance.quorum})` : ''}` : 'single'],
    ['Exclusivity', rights ? `${rights.exclusivity_days} days` : '0 days'],
    ['Resale', rights ? String(rights.allow_resale_after_exclusivity) : 'false'],
    ['Created', String(t.created_at ?? '—')],
    ['Published', String(t.published_at ?? '—')],
  ];

  const maxKey = Math.max(...rows.map(([k]) => k.length));
  return rows
    .map(([k, v]) => `| ${k.padEnd(maxKey)} | ${v} |`)
    .join('\n');
}

function taskListTable(tasks: Record<string, unknown>[]): string {
  if (tasks.length === 0) return '_No tasks found._';

  const header = '| ID | Title | Bounty | Status | Distance |';
  const sep = '|------|-------|--------|--------|----------|';
  const rows = tasks.map((t) => {
    const bounty = t.bounty as Record<string, unknown> | undefined;
    const short_id = String(t.id ?? '').slice(0, 8);
    return `| ${short_id}… | ${t.title} | ${bounty ? `${bounty.amount} ${bounty.currency}` : '—'} | ${t.status} | ${t.distance_m != null ? `${t.distance_m}m` : '—'} |`;
  });

  return [header, sep, ...rows].join('\n');
}

function submissionTable(s: Record<string, unknown>): string {
  const worker = s.worker as Record<string, unknown> | undefined;
  const artefacts = (s.artefacts as unknown[]) || [];

  const rows: [string, string][] = [
    ['Submission ID', String(s.id ?? '—')],
    ['Status', String(s.status ?? '—')],
    ['Verification Score', String(s.verificationScore ?? '—')],
    ['Proof Hash', String(s.proofBundleHash ?? '—')],
    ['Created', String(s.created_at ?? '—')],
    ['Finalised', String(s.finalised_at ?? '—')],
    ['Worker', worker ? `${worker.username ?? worker.id}${worker.ens_name ? ` (${worker.ens_name})` : ''}` : '—'],
    ['Artefacts', `${artefacts.length} file(s)`],
  ];

  const maxKey = Math.max(...rows.map(([k]) => k.length));
  return rows
    .map(([k, v]) => `| ${k.padEnd(maxKey)} | ${v} |`)
    .join('\n');
}

// ---------------------------------------------------------------------------
// Tool definitions
// ---------------------------------------------------------------------------

const TOOLS = [
  {
    name: 'create_task',
    description:
      'Create a new bounty task on Field Network. A human will fulfill it in the real world (photo, verification, data collection). The task persists on your account forever — use find_task or inbox in a later session to check results. Returns a draft; call publish_task to fund escrow and go live.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        title: {
          type: 'string',
          description: 'Short task title (5-200 chars). E.g., "Photo of 123 Main St storefront"',
        },
        instructions: {
          type: 'string',
          description: 'Detailed instructions for the human worker (10-2000 chars). What to capture, angles, specific details to include.',
        },
        lat: {
          type: 'number',
          description: 'Latitude of the target location (-90 to 90)',
        },
        lon: {
          type: 'number',
          description: 'Longitude of the target location (-180 to 180)',
        },
        radius_m: {
          type: 'number',
          description: 'Acceptable radius in meters from the target point (default: 100)',
        },
        bounty_amount: {
          type: 'number',
          description: 'Payment amount for completing the task (min: 1)',
        },
        currency: {
          type: 'string',
          description: 'Payment currency, 3-letter code (default: "GBP")',
        },
        time_window_hours: {
          type: 'number',
          description: 'Hours from now until the task expires (default: 48)',
        },
        photo_count: {
          type: 'number',
          description: 'Number of photos required (default: 1, max: 20)',
        },
        bearing_deg: {
          type: 'number',
          description: 'Required camera bearing in degrees (0-360). Optional.',
        },
        assurance_mode: {
          type: 'string',
          enum: ['single', 'quorum'],
          description: 'single = one worker, quorum = multiple workers must agree (default: single)',
        },
        exclusivity_days: {
          type: 'number',
          description: 'Days of exclusive rights to the collected data (default: 0)',
        },
        allow_resale: {
          type: 'boolean',
          description: 'Allow the data to be resold on the marketplace after exclusivity (default: false)',
        },
      },
      required: ['title', 'instructions', 'lat', 'lon', 'bounty_amount'],
    },
  },
  {
    name: 'publish_task',
    description:
      'Fund the escrow and publish a draft task, making it visible to workers on the Field Network marketplace. The bounty amount is locked in escrow until the task is completed or cancelled.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        task_id: {
          type: 'string',
          description: 'The task ID returned from create_task',
        },
      },
      required: ['task_id'],
    },
  },
  {
    name: 'list_tasks',
    description:
      'Browse tasks on Field Network. Filter by location, bounty, status. Use mine=true to see your own posted tasks.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        near_lat: { type: 'number', description: 'Filter: latitude to search near' },
        near_lon: { type: 'number', description: 'Filter: longitude to search near' },
        max_distance_m: { type: 'number', description: 'Max distance from lat/lon in meters (default: 50000)' },
        min_bounty: { type: 'number', description: 'Minimum bounty amount' },
        status: { type: 'string', description: 'Filter by status: draft, posted, claimed, submitted, accepted, disputed, cancelled' },
        mine: { type: 'boolean', description: 'Show only your own tasks (default: false)' },
        limit: { type: 'number', description: 'Max results (default: 20)' },
      },
    },
  },
  {
    name: 'get_task',
    description:
      'Get full details of a specific task, including submissions and claims.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        task_id: { type: 'string', description: 'The task ID' },
      },
      required: ['task_id'],
    },
  },
  {
    name: 'accept_submission',
    description:
      'Accept a submission and release the escrow payment to the worker. This is irreversible — the worker gets paid.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        submission_id: { type: 'string', description: 'The submission ID to accept' },
        comment: { type: 'string', description: 'Optional feedback for the worker' },
      },
      required: ['submission_id'],
    },
  },
  {
    name: 'reject_submission',
    description:
      'Reject a submission. The worker can dispute this. Provide a clear reason.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        submission_id: { type: 'string', description: 'The submission ID to reject' },
        reason_code: {
          type: 'string',
          enum: ['wrong_location', 'poor_quality', 'incomplete', 'wrong_subject', 'fraudulent', 'other'],
          description: 'Reason for rejection',
        },
        comment: { type: 'string', description: 'Detailed explanation of why the submission was rejected' },
      },
      required: ['submission_id', 'reason_code'],
    },
  },
  {
    name: 'cancel_task',
    description:
      'Cancel a task and refund the escrow. Only works for draft/posted/claimed tasks.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        task_id: { type: 'string', description: 'The task ID to cancel' },
        reason: { type: 'string', description: 'Why the task is being cancelled' },
      },
      required: ['task_id'],
    },
  },
  {
    name: 'inbox',
    description:
      'Check for tasks that need your attention — new submissions to review, active disputes, expired tasks. This is the first thing to call when resuming a session. Results persist across conversations; nothing is lost.',
    inputSchema: {
      type: 'object' as const,
      properties: {},
    },
  },
  {
    name: 'find_task',
    description:
      'Find a task by its title (or part of it). Useful when you created a task in a previous conversation and need to find it again. Tasks persist on the account — they are never lost between sessions.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        query: { type: 'string', description: 'Search term to match against task titles' },
      },
      required: ['query'],
    },
  },
];

// ---------------------------------------------------------------------------
// Tool handlers
// ---------------------------------------------------------------------------

async function handleTool(
  name: string,
  args: Record<string, unknown>,
): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
  const text = (s: string) => ({ content: [{ type: 'text' as const, text: s }] });

  switch (name) {
    // ------------------------------------------------------------------
    case 'create_task': {
      const now = new Date();
      const hours = (args.time_window_hours as number) || 48;
      const end = new Date(now.getTime() + hours * 60 * 60 * 1000);

      const body = {
        template: 'geo_photo_v1',
        title: args.title,
        instructions: args.instructions,
        location: {
          type: 'point',
          lat: args.lat,
          lon: args.lon,
          radius_m: (args.radius_m as number) || 100,
        },
        time_window: {
          start_iso: now.toISOString(),
          end_iso: end.toISOString(),
        },
        requirements: {
          photos: {
            count: (args.photo_count as number) || 1,
            min_width_px: 1024,
            min_height_px: 768,
            format_allow: ['jpeg', 'png', 'heic'],
            no_filters: true,
          },
          ...(args.bearing_deg != null
            ? {
                bearing: {
                  required: true,
                  target_deg: args.bearing_deg,
                  tolerance_deg: 30,
                },
              }
            : {}),
          freshness: { must_be_captured_within_task_window: true },
        },
        assurance: {
          mode: (args.assurance_mode as string) || 'single',
          quorum: null,
        },
        bounty: {
          currency: (args.currency as string) || 'GBP',
          amount: args.bounty_amount,
        },
        rights: {
          exclusivity_days: (args.exclusivity_days as number) || 0,
          allow_resale_after_exclusivity: (args.allow_resale as boolean) || false,
        },
      };

      const res = await api('POST', '/v1/tasks', body);

      if (!res.ok) {
        return text(
          `**Failed to create task** (${res.status})\n\n\`\`\`json\n${JSON.stringify(res.data, null, 2)}\n\`\`\``,
        );
      }

      // Fetch the full task to display
      const detail = await api('GET', `/v1/tasks/${(res.data as Record<string, unknown>).id}`);
      const task = (detail.ok ? detail.data : res.data) as Record<string, unknown>;

      return text(
        `**Task created** (draft — call \`publish_task\` to fund escrow and go live)\n\n${taskTable(task)}\n\n_Next: call \`publish_task\` with task_id \`${task.id}\` to fund the escrow and make this task visible to workers._`,
      );
    }

    // ------------------------------------------------------------------
    case 'publish_task': {
      const res = await api('POST', `/v1/tasks/${args.task_id}/publish`);

      if (!res.ok) {
        return text(`**Failed to publish task** (${res.status})\n\n\`\`\`json\n${JSON.stringify(res.data, null, 2)}\n\`\`\``);
      }

      const detail = await api('GET', `/v1/tasks/${args.task_id}`);
      const task = (detail.ok ? detail.data : res.data) as Record<string, unknown>;

      return text(
        `**Task published and escrow funded!** Workers can now claim this task.\n\n${taskTable(task)}`,
      );
    }

    // ------------------------------------------------------------------
    case 'list_tasks': {
      const params = new URLSearchParams();
      if (args.near_lat != null) params.set('near_lat', String(args.near_lat));
      if (args.near_lon != null) params.set('near_lon', String(args.near_lon));
      if (args.max_distance_m != null) params.set('max_distance', String(args.max_distance_m));
      if (args.min_bounty != null) params.set('min_bounty', String(args.min_bounty));
      if (args.status) params.set('status', args.status as string);
      if (args.mine) params.set('mine', 'true');
      params.set('limit', String((args.limit as number) || 20));

      const res = await api('GET', `/v1/tasks?${params.toString()}`);

      if (!res.ok) {
        return text(`**Failed to list tasks** (${res.status})\n\n\`\`\`json\n${JSON.stringify(res.data, null, 2)}\n\`\`\``);
      }

      const data = res.data as { tasks: Record<string, unknown>[] };
      return text(
        `**${data.tasks.length} task(s) found**\n\n${taskListTable(data.tasks)}`,
      );
    }

    // ------------------------------------------------------------------
    case 'get_task': {
      const res = await api('GET', `/v1/tasks/${args.task_id}`);

      if (!res.ok) {
        return text(`**Task not found** (${res.status})`);
      }

      const task = res.data as Record<string, unknown>;
      const submissions = (task.submissions as Record<string, unknown>[]) || [];

      let out = `**Task Details**\n\n${taskTable(task)}`;

      if (submissions.length > 0) {
        out += `\n\n**Submissions (${submissions.length})**\n`;
        for (const sub of submissions) {
          out += `\n${submissionTable(sub)}\n`;
        }
      }

      return text(out);
    }

    // ------------------------------------------------------------------
    case 'accept_submission': {
      const body: Record<string, unknown> = {};
      if (args.comment) body.comment = args.comment;

      const res = await api('POST', `/v1/submissions/${args.submission_id}/accept`, body);

      if (!res.ok) {
        return text(`**Failed to accept submission** (${res.status})\n\n\`\`\`json\n${JSON.stringify(res.data, null, 2)}\n\`\`\``);
      }

      return text(
        `**Submission accepted.** Escrow released to worker.\n\nSubmission ID: \`${args.submission_id}\``,
      );
    }

    // ------------------------------------------------------------------
    case 'reject_submission': {
      const body = {
        reason_code: args.reason_code,
        comment: args.comment || '',
      };

      const res = await api('POST', `/v1/submissions/${args.submission_id}/reject`, body);

      if (!res.ok) {
        return text(`**Failed to reject submission** (${res.status})\n\n\`\`\`json\n${JSON.stringify(res.data, null, 2)}\n\`\`\``);
      }

      return text(
        `**Submission rejected.**\n\nReason: ${args.reason_code}\nSubmission ID: \`${args.submission_id}\`\n\n_The worker may open a dispute._`,
      );
    }

    // ------------------------------------------------------------------
    case 'cancel_task': {
      const res = await api('POST', `/v1/tasks/${args.task_id}/cancel`, {
        reason: args.reason || 'Cancelled by requester',
      });

      if (!res.ok) {
        return text(`**Failed to cancel task** (${res.status})\n\n\`\`\`json\n${JSON.stringify(res.data, null, 2)}\n\`\`\``);
      }

      return text(
        `**Task cancelled.** Escrow refunded.\n\nTask ID: \`${args.task_id}\``,
      );
    }

    // ------------------------------------------------------------------
    case 'inbox': {
      // Fetch tasks needing attention: submitted (need review), disputed, claimed (in progress)
      const [submitted, disputed, posted] = await Promise.all([
        api('GET', '/v1/tasks?mine=true&status=submitted&limit=20'),
        api('GET', '/v1/tasks?mine=true&status=disputed&limit=10'),
        api('GET', '/v1/tasks?mine=true&status=posted&limit=10'),
      ]);

      const sections: string[] = [];

      const submittedTasks = submitted.ok ? (submitted.data as { tasks: Record<string, unknown>[] }).tasks : [];
      const disputedTasks = disputed.ok ? (disputed.data as { tasks: Record<string, unknown>[] }).tasks : [];
      const postedTasks = posted.ok ? (posted.data as { tasks: Record<string, unknown>[] }).tasks : [];

      if (submittedTasks.length > 0) {
        sections.push(`**Needs review** (${submittedTasks.length} submission${submittedTasks.length > 1 ? 's' : ''} waiting)\n\n${taskListTable(submittedTasks)}`);
      }

      if (disputedTasks.length > 0) {
        sections.push(`**Active disputes** (${disputedTasks.length})\n\n${taskListTable(disputedTasks)}`);
      }

      if (postedTasks.length > 0) {
        sections.push(`**Open tasks** (${postedTasks.length} waiting for a worker)\n\n${taskListTable(postedTasks)}`);
      }

      if (sections.length === 0) {
        return text('**Inbox is empty.** No tasks need your attention right now.\n\nUse `create_task` to post a new bounty, or `list_tasks` to browse.');
      }

      return text(`**Your inbox**\n\n${sections.join('\n\n---\n\n')}\n\n_Use \`get_task\` with any task ID to see full details and submissions._`);
    }

    // ------------------------------------------------------------------
    case 'find_task': {
      const query = (args.query as string || '').toLowerCase();
      const res = await api('GET', '/v1/tasks?mine=true&limit=50');

      if (!res.ok) {
        return text(`**Search failed** (${res.status})`);
      }

      const all = (res.data as { tasks: Record<string, unknown>[] }).tasks;
      const matches = all.filter((t) =>
        String(t.title || '').toLowerCase().includes(query) ||
        String(t.id || '').startsWith(query),
      );

      if (matches.length === 0) {
        return text(`**No tasks found matching "${args.query}".** Try a different search term, or use \`list_tasks(mine=true)\` to see all your tasks.`);
      }

      return text(`**${matches.length} task(s) matching "${args.query}"**\n\n${taskListTable(matches)}\n\n_Use \`get_task\` with any task ID for full details._`);
    }

    // ------------------------------------------------------------------
    default:
      return text(`Unknown tool: ${name}`);
  }
}

// ---------------------------------------------------------------------------
// Server setup
// ---------------------------------------------------------------------------

const server = new Server(
  {
    name: 'field-network',
    version: '0.1.0',
  },
  {
    capabilities: {
      tools: {},
    },
  },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: TOOLS,
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  if (!API_TOKEN) {
    return {
      content: [
        {
          type: 'text' as const,
          text: '**Not authenticated.** Set the `FIELD_API_TOKEN` environment variable to your Field Network JWT token.\n\nGet a token by registering at your Field Network instance and calling `POST /v1/auth/login`.',
        },
      ],
    };
  }

  return handleTool(name, (args ?? {}) as Record<string, unknown>);
});

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Field Network MCP server running on stdio');
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
