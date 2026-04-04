FROM ghcr.io/heikogr/mmm-devcontainer:node24-trixie-slim

WORKDIR /opt/magic_mirror

COPY --chmod=755 ./entrypoint.sh /entrypoint.sh

# Provide a default PM2 ecosystem file so `pm2-runtime` can start MagicMirror.
# This is a minimal file intended for development in the devcontainer.
COPY ./ecosystem.config.js /opt/magic_mirror/ecosystem.config.js

EXPOSE 8080

ENTRYPOINT ["/entrypoint.sh"]