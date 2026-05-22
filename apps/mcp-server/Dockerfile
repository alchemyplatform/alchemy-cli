FROM node:22-slim AS build
WORKDIR /repo
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY scripts ./scripts
COPY apps/cli/package.json ./apps/cli/package.json
COPY apps/mcp-server/package.json ./apps/mcp-server/package.json
RUN SKIP_SKILL_SYNC=1 pnpm install --frozen-lockfile --ignore-scripts

COPY apps/mcp-server ./apps/mcp-server
RUN pnpm --filter @alchemy/mcp-server build
RUN SKIP_SKILL_SYNC=1 pnpm --filter @alchemy/mcp-server --prod deploy --legacy /app

FROM node:22-slim
WORKDIR /app
COPY --from=build /app ./
EXPOSE 3000 9090
USER node
CMD ["node", "dist/index.js"]
