# Build context is the repo root (see docker-compose.yml) so this stage can
# also reach apps/cli — the final image needs the infracanvas CLI binary on
# PATH for the local_agent SSH ProxyCommand bridge (see runner.go's
# cliHelperPath(), and obsidian_memory/08.4's Phase 1).
FROM golang:1.23 AS builder
WORKDIR /src

# apps/api
COPY apps/api/go.mod apps/api/go.sum ./apps/api/
RUN cd apps/api && GOPROXY=direct go mod download
COPY apps/api ./apps/api
RUN cd apps/api && CGO_ENABLED=0 GOOS=linux go build -o /out/api-server .

# apps/cli — a separate Go module that may require a newer toolchain than
# apps/api. The golang base image ships with GOTOOLCHAIN=local (no auto
# download), so it's explicitly overridden to `auto` here, on the default
# GOPROXY (not GOPROXY=direct, which doesn't serve toolchain downloads), so
# `go` fetches whatever toolchain apps/cli/go.mod declares.
COPY apps/cli/go.mod apps/cli/go.sum ./apps/cli/
RUN cd apps/cli && GOTOOLCHAIN=auto go mod download
COPY apps/cli ./apps/cli
RUN cd apps/cli && GOTOOLCHAIN=auto CGO_ENABLED=0 GOOS=linux go build -o /out/infracanvas .

# Pull prebuilt tools baseline from GHCR (installs nothing locally)
FROM ghcr.io/whiparc/whiparc-runner-base:latest
ENV IS_DOCKER=true
ENV PORT=8080

WORKDIR /app
COPY --from=builder /out/api-server .
COPY --from=builder /out/infracanvas /usr/local/bin/infracanvas
RUN chmod +x /usr/local/bin/infracanvas

EXPOSE 8080
CMD ["./api-server"]
