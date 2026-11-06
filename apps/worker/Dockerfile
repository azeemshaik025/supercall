FROM node:22-alpine

RUN corepack enable && corepack prepare pnpm@11.9.0 --activate

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY apps/extension/package.json apps/extension/
COPY apps/worker/package.json apps/worker/
COPY packages/core/package.json packages/core/
COPY packages/api-schema/package.json packages/api-schema/
COPY packages/arkiv/package.json packages/arkiv/
COPY packages/chains/package.json packages/chains/
COPY packages/db/package.json packages/db/
COPY packages/identity/package.json packages/identity/
COPY packages/flash/package.json packages/flash/
COPY packages/config/package.json packages/config/

RUN pnpm install --frozen-lockfile

COPY . .

CMD ["pnpm", "--filter", "@supercall/worker", "start"]
