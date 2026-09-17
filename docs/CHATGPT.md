# ChatGPT and MCP

## Current usable workflow

Copy the weekly review from the Coach tab and paste it into the user's normal ChatGPT conversation. This sends no OpenAI model API request from the tracker. Advice returned in ChatGPT does not automatically change the stored plan.

## Direct connection status

The authenticated `/mcp` implementation was published in the original Site. Its hosting account returned:

> Sites MCP is not enabled for this Site owner.

No plugin ID, OAuth resource or working ChatGPT installation was returned. The Coach UI exposes this limitation. The endpoint being implemented is not evidence that it is connected to a ChatGPT account.

When the account capability becomes available, retrieve the connection details from the hosting service and use the returned endpoint, OAuth resource and plugin ID. Verify an actual authorised session before changing the UI's status. Do not invent connection metadata or introduce a bearer-token bypass.

## Tool catalogue

| Tool | Behaviour |
| --- | --- |
| `read_week` | Recorded weekly metrics and calculated review; excludes journal notes. |
| `read_day` | A day's records; notes require explicit `includeNotes: true`. |
| `log_daily_metrics` | Replace named daily totals and supported recovery fields. |
| `log_meals` | Append portion-specific meals with validated macros. |
| `log_workout` | Append exercises and sets. |
| `update_goals` | Apply explicitly requested goal changes. |
| `create_habit` | Create a habit. |
| `set_habit_completion` | Set a habit's completion for a date. |

The two read tools have read-only annotations. All writes are owner-scoped and use durable request IDs. Daily and goal writes use expected revisions. Tool arguments cannot supply an owner or authentication token. Nutrition values describe the complete portion; the tool does not estimate them from a photo.

## Protocol and privacy

The server implements stateless Streamable HTTP JSON-RPC and negotiates MCP protocol `2025-03-26` or `2025-06-18`. GET and DELETE return 405; requests without identity are rejected. Origin, body size and schema checks run before commands. Responses use private/no-store caching.

Default reads omit journal and exercise notes. Read access and explicitly requested changes must be tested separately during activation. A general request for a review is not a request to change targets.

The browser also has optional WebMCP registration for the read-only `read_metric_week` tool. This browser API is separate from the remote `/mcp` connection and has not been runtime-validated on the iPhone.
