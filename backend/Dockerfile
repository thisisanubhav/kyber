ARG NODE_IMAGE=node:24-alpine@sha256:ebfe2f90462722a7a4de65e91990e97fe0d401c70e0e762c5b53302f905ec1c1

FROM ${NODE_IMAGE} AS build
WORKDIR /workspace
COPY package.json package-lock.json ./
COPY backend/package.json backend/package.json
COPY app/package.json app/package.json
COPY website/package.json website/package.json
RUN npm ci
COPY backend backend
RUN npm run build --workspace backend

FROM ${NODE_IMAGE}
ARG VCS_REF=unknown
LABEL org.opencontainers.image.title="Kyber API and worker" \
      org.opencontainers.image.revision=${VCS_REF}
ENV NODE_ENV=production
WORKDIR /workspace
COPY package.json package-lock.json ./
COPY backend/package.json backend/package.json
COPY app/package.json app/package.json
COPY website/package.json website/package.json
RUN npm ci --omit=dev --workspace backend && npm cache clean --force
COPY --from=build /workspace/backend/dist backend/dist
COPY --from=build /workspace/backend/migrations backend/migrations
WORKDIR /workspace/backend
USER node
CMD ["node", "dist/server.js"]
