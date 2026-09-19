FROM rust:1.98-bookworm AS build
WORKDIR /src
COPY . .
RUN cargo build --release --workspace

FROM debian:bookworm-slim AS runtime
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=build /src/target/release/tobot-control-plane /usr/local/bin/tobot-control-plane
COPY --from=build /src/target/release/tobot-discord-edge /usr/local/bin/tobot-discord-edge
COPY --from=build /src/target/release/tobot-delivery /usr/local/bin/tobot-delivery
COPY --from=build /src/target/release/tobot-migrate /usr/local/bin/tobot-migrate
USER 65532:65532
