## Summary

<!-- What does this PR do, and why? One or two sentences a reviewer can read first. -->

## Related issue

<!-- Closes #123, or "N/A". For anything beyond a small fix, link the issue or
     discussion where the approach was agreed. -->

## Type of change

- [ ] Bug fix
- [ ] New feature
- [ ] Breaking change
- [ ] Documentation
- [ ] Chore / refactor / tooling

## Area

- [ ] `apps/web` (BSL 1.1, CLA required)
- [ ] `apps/api` (BSL 1.1, CLA required)
- [ ] `apps/cli` (MIT)
- [ ] `sandbox` / `spikes` (MIT)
- [ ] Docs, CI or repo tooling (MIT)

## Testing performed

<!-- What did you run to confirm this works? Commands, screenshots, or a
     description of manual testing. "None" is a valid answer for docs-only
     changes, but say so explicitly. -->

## Screenshots or recording

<!-- Required for any visible UI change: before and after. Delete this
     section otherwise. -->

## Checklist

- [ ] Lint/build/tests pass locally (`npm run lint`, `npm test` and
      `npm run build` for `apps/web`, `go vet ./... && go test ./...` for any
      Go module touched)
- [ ] The PR title follows Conventional Commits (`type(scope): description`)
- [ ] Docs updated if behavior or setup steps changed (including
      `apps/web/app/docs/DocsPageV2.tsx` for CLI changes)
- [ ] No secrets, `.env` files, or build outputs committed
- [ ] If this touches `apps/web/` or `apps/api/`,
      I understand the CLA bot will ask me to sign the
      [CLA](../CLA.md) before merge
- [ ] If AI tools wrote a substantial part of this, I have read, run and
      understood all of it
