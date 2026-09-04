# @amy/plugin-linear

Linear as the tracker, over its GraphQL API.

Mounts the `tracker` port, and contributes the channel that comments on the
ticket itself, because the tracker is what a ticket comment belongs to.

## Things about this API that cost an afternoon

- **The auth header is not uniform.** A personal API key goes raw; an OAuth
  token goes as a bearer. Getting it the wrong way round does not error, it
  returns nothing useful. This adapter decides from the `lin_api_` prefix.
- **`issue(id:)` takes the human identifier** like `ACME-123`, but
  `commentCreate` wants the issue's uuid, so every comment resolves first.
- **The branch field is `branchName`** in GraphQL. Never derive a branch
  locally: the tracker owns the slug, truncates long titles its own way, and a
  branch that disagrees breaks its automatic pull request linking.
- **The status is matched by name.** Filtering by category would also match In
  Review, In QA and Ready To Release, which are all past implementation.
- **A comment by the operator's own account is not an answer** to the
  machine's own question, or asking would resolve itself.

## Settings

| Setting | Default | |
| :-- | :-- | :-- |
| `workingStatusName` | required | the exact status name to pick up |
| `repoByTeam` | `{}` | which repository a team's tickets land in |
| `defaultRepo` | `""` | used for a team that is not mapped |

Needs `LINEAR_API_KEY` in the environment. `amy` reads it from a gitignored
`.env`, and anything already exported wins over the file.
