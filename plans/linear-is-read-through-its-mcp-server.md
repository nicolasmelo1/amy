---
base: f7c921d26a01f467d6a6e7ac1cdb484bac55f919
sources:
  - { id: S1, kind: friction, said: "2026-11-19: a private project's Linear workspace allows no personal API keys, so plugin-linear could not mount there; its members may still authorize an MCP client with their own login" }
  - { id: S2, kind: code, ref: "plugins/linear/src/plugin.ts", said: "plugin-linear mounts only with LINEAR_API_KEY, and speaks to the GraphQL API with it; it offers the tracker and feature ports" }
  - { id: S3, kind: reference, ref: "https://linear.app/docs/mcp", said: "the server is https://mcp.linear.app/mcp over Streamable HTTP; the interactive setup uses OAuth 2.1 with dynamic client registration; https://mcp.linear.app/mcp/readonly only ever exposes read tools, as does a token granted only the read scope" }
  - { id: S4, kind: reference, ref: "https://linear.app/docs/mcp", said: "the server has tools for finding, creating and updating issues, projects and comments; the page names none of them" }
  - { id: S5, kind: reference, ref: "https://modelcontextprotocol.io/specification/2025-06-18/basic/authorization", said: "an MCP client authorizes with OAuth 2.1 and PKCE, may register itself dynamically (RFC 7591), and refreshes its access token with the refresh token it was given" }
  - { id: S6, kind: decision, said: "a new plugin, @amykit/plugin-linear-mcp, beside plugin-linear rather than a mode of it: another transport and another credential, the same config names (workingStatusName, repoByTeam, defaultRepo, repoByLabel) and the same tracker answers. Decided 2026-11-19, in the private project's fork" }
  - { id: S7, kind: decision, said: "the login is the operator's own: OAuth 2.1 with dynamic registration and PKCE on a loopback redirect, kept in one file in the profile's directory, mode 0600. Decided 2026-11-19, in the private project's fork" }
  - { id: S10, kind: decision, said: "a call refreshes the token five minutes before it expires and rewrites the file. Decided 2026-11-19, in the private project's fork" }
  - { id: S8, kind: decision, said: "readOnly: true reads the read-only endpoint, and every tracker write throws naming it; with readOnly false, writes go through the server's own tools. Decided 2026-11-19" }
  - { id: S9, kind: decision, said: "tool names are not hard-coded on trust: the plugin reads tools/list once per session and refuses, naming it, a tracker method whose tool the server does not offer. Decided 2026-11-19" }
touches:
  - plugins/linear-mcp/package.json
  - plugins/linear-mcp/tsconfig.json
  - plugins/linear-mcp/README.md
  - plugins/linear-mcp/src/index.ts
  - plugins/linear-mcp/src/plugin.ts
  - plugins/linear-mcp/src/config.ts
  - plugins/linear-mcp/src/mcp.ts
  - plugins/linear-mcp/src/login.ts
  - plugins/linear-mcp/src/McpLinearTracker.ts
  - plugins/linear-mcp/tests/mcp.test.ts
  - plugins/linear-mcp/tests/login.test.ts
  - plugins/linear-mcp/tests/McpLinearTracker.test.ts
  - plugins/linear-mcp/tests/plugin.test.ts
  - registry/plugin-linear-mcp.json
  - docs/reference/plugins.md
  - package-lock.json
criteria:
  - { id: A1, statement: "for the same issues and config, McpLinearTracker answers inProgress, get and comments as LinearTracker does: the working status by exact name, the repository by label, team, then defaultRepo, and fromAmy for the logged-in user", proof: "deferred:test:plugins/linear-mcp/tests/McpLinearTracker.test.ts", sources: [S2, S6] }
  - { id: A2, statement: "the login registers a client, opens the authorization URL with a PKCE challenge, takes the code on a loopback redirect, and writes client id, access and refresh token and their time to the token file with mode 0600", proof: "deferred:test:plugins/linear-mcp/tests/login.test.ts", sources: [S3, S5, S7] }
  - { id: A3, statement: "a call made within five minutes of the token's expiry refreshes it first and rewrites the file; a refresh the server refuses throws naming the login command", proof: "deferred:test:plugins/linear-mcp/tests/mcp.test.ts", sources: [S5, S10] }
  - { id: A4, statement: "with no token file the plugin's mount fails naming the login command and the file it would write", proof: "deferred:test:plugins/linear-mcp/tests/plugin.test.ts", sources: [S1, S7] }
  - { id: A5, statement: "with readOnly true the client speaks to /mcp/readonly, and comment, setStatus, assign and createFollowUp throw naming the read-only endpoint, sending nothing", proof: "deferred:test:plugins/linear-mcp/tests/McpLinearTracker.test.ts", sources: [S3, S8] }
  - { id: A6, statement: "a tracker method whose tool tools/list does not offer throws naming the tool and the endpoint, and no other call is made in its place", proof: "deferred:test:plugins/linear-mcp/tests/McpLinearTracker.test.ts", sources: [S4, S9] }
crosses:
  - { mechanism: tracker-and-host-writes, answer: works, proof: "deferred:A5, A6; every write goes through TrackerWrites as plugin-linear's does, so a claim and the operator policy apply unchanged" }
guarantee:
  - { holds: "the plugin never sends a write on the read-only endpoint, and never calls a tool the server did not list", not_against: "a server that lists a tool and then answers it with a different meaning" }
  - { holds: "the login file holds the only credential, readable by its owner alone, and every refresh rewrites it whole", not_against: "another process on the machine running as the same user" }
failures:
  - { step: mount, when: "the token file is missing or unreadable", goes_to: "the mount fails naming the login command" }
  - { step: refresh, when: "the server refuses the refresh token", goes_to: "the call throws naming the login command; the engine retries, and the owner hears at the ceiling" }
  - { step: write, when: "readOnly is true", goes_to: "thrown naming the read-only endpoint, before anything is sent" }
cut:
  - "a Linear API key or bearer token: plugin-linear already speaks with one"
  - "the feature port: grooming keeps plugin-linear until friction asks for it here"
  - "the SSE transport, which Linear calls a deprecated fallback"
exit: "a workspace that allows no personal API keys is a tracker for amy after one login, read and, unless readOnly, written through Linear's own MCP server"
---

# Linear is read through its MCP server

A workspace that allows no personal API key still lets its members authorize
an MCP client. A new tracker plugin speaks to Linear's MCP server with the
operator's own OAuth login, keeps plugin-linear's config and answers, and
writes only when it is not pointed at the read-only endpoint.
