# The Eden game server (site + accounts + live garden + expedition rooms) as one container.
# Runs on any host that takes a Docker image and gives it a persistent volume: see docs/MULTIPLAYER-HOSTING.md.
#
#   docker build -t eden .
#   docker run -p 8080:8080 -v eden-data:/data -e EDEN_PUBLIC_ORIGIN=https://play.example.com eden
#
# Exactly one instance per data volume: the server refuses to start a second writer.
FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund
COPY . .
# Listen on all interfaces inside the container; the host's HTTPS proxy is the only way in.
ENV EDEN_HOST=0.0.0.0 PORT=8080 EDEN_DATA_DIR=/data EDEN_TRUST_PROXY=1
VOLUME /data
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/healthz').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"
# SIGTERM writes a final checkpoint (accounts and expedition rooms) before exiting.
STOPSIGNAL SIGTERM
CMD ["node", "server/eden-server.mjs"]
