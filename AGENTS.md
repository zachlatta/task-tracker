# Repository Guidelines

## Development workflow

- This is a Go repository. Follow standard Go conventions and keep code formatted with `gofmt`.
- Use test-driven development for every behavior change: write or update a test first, confirm that it fails for the expected reason, implement the smallest change that makes it pass, and then refactor while keeping the tests green.
- Before considering work complete, run the full automated test suite end to end (normally `go test ./...`) and manually test the affected behavior. Report both automated and manual verification results.
- Do not skip testing for a change unless testing is impossible; explain any gap explicitly.

## Public repository safety

- Treat everything committed to this repository as public.
- Never add secrets, credentials, tokens, private keys, personal data, private URLs, internal-only information, or other non-public material.
- Before committing, review the complete diff and staged files for accidental sensitive or private content.

## Worktrees, commits, and pushes

- When working in a worktree, the default finish flow is to commit completed work and push it to `main`.
- Before asking for permission to commit and push, finish the implementation, run the full automated test suite end to end, and manually test the changes.
- Always show the verification results and ask the user for explicit confirmation before committing or pushing.
- Never commit or push unfinished or failing work unless the user explicitly requests it.
