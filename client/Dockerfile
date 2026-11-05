# Builds the MUNMeet web client into a self-contained Node server.
#
# The build context is this `client/` folder, set by `build.context` in
# ../docker-compose.yaml, so every path below is relative to it.

# A shared starting point, so both stages get the same Node and the same pnpm.
# The image is a release tag and its digest, not the floating `22-alpine`, which
# moves with every Node and Alpine release: a rebuild next month then produces
# the same image as one today, and nobody can change what the tag points at. The
# digest is the image index's, from
# `docker buildx imagetools inspect node:22.23.4-alpine3.24`, so it covers arm64
# and amd64 alike. To update Node, change the tag and the digest together.
FROM node:22.23.4-alpine3.24@sha256:fe4f6d74e20370acb04ad889077d14d0f64a9c8ea6a42bc60cddf1e844699914 AS base
RUN npm install --global pnpm@12.5.1
WORKDIR /app

# ---------------------------------------------------------------------------
# Stage 1: install every package and build the app.
# ---------------------------------------------------------------------------
FROM base AS builder

# Copy only the files that decide which packages get installed, before the
# source code. Docker then reuses the cached install layer on every rebuild
# where only source code changed, which is almost all of them.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
RUN pnpm install --frozen-lockfile

COPY . .

# The PUBLIC_* values have to be known *now*, not when the container starts.
# The app reads them through `$env/static/public`, which Vite replaces with the
# literal text while building — both in the server bundle and in the JavaScript
# the visitor's browser downloads. That second copy is why the address passed
# here has to be one the public internet can reach: `http://127.0.0.1:54321`
# would mean every visitor's browser calling their own machine. The tunnel
# publishes the local Supabase as a real hostname for exactly this reason; the
# tunnel service in ../docker-compose.yaml says which hostnames those are.
ARG PUBLIC_SUPABASE_URL
ARG PUBLIC_SUPABASE_PUBLISHABLE_KEY
ENV PUBLIC_SUPABASE_URL=$PUBLIC_SUPABASE_URL
ENV PUBLIC_SUPABASE_PUBLISHABLE_KEY=$PUBLIC_SUPABASE_PUBLISHABLE_KEY

RUN pnpm run build

# ---------------------------------------------------------------------------
# Stage 2: the image that actually runs. None of the build tools come with it.
# ---------------------------------------------------------------------------
FROM base

# `node build` needs three things: the built output, the manifest naming the
# packages it imports at runtime, and those packages. `--prod` leaves out every
# build and test tool, which is most of what the builder installed.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
RUN pnpm install --prod --frozen-lockfile

# `static/` is deliberately not copied: the adapter already folded those files
# into `build/client/` while building.
COPY --from=builder /app/build ./build

# The base image provides an unprivileged `node` user. Nothing here writes to
# disk, so the app never needs to be root.
USER node

# adapter-node listens on 3000 unless PORT says otherwise. docker-compose.yaml
# does not publish it on the host: the Cloudflare tunnel container is the only
# thing that reaches it, over a private Docker network.
ENV PORT=3000
EXPOSE 3000

CMD ["node", "build"]
