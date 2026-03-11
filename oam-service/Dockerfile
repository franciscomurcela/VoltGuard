# ── Stage 1: Build ─────────────────────────────────────────────────────────────
FROM rust:1.93-slim AS builder

WORKDIR /app

RUN apt-get update && apt-get install -y pkg-config libssl-dev curl && rm -rf /var/lib/apt/lists/*

# Cache dependencies before copying real source
COPY Cargo.toml Cargo.lock ./
RUN mkdir -p src && echo 'fn main() {}' > src/main.rs
RUN cargo build --release --locked
RUN rm -f target/release/deps/oam_service*

# Build real source
COPY src ./src
COPY migrations ./migrations
RUN touch src/main.rs && cargo build --release --locked

# ── Stage 2: Runtime ───────────────────────────────────────────────────────────
FROM debian:bookworm-slim AS runtime

WORKDIR /app

RUN apt-get update && apt-get install -y ca-certificates libssl3 && rm -rf /var/lib/apt/lists/*

COPY --from=builder /app/target/release/oam-service ./oam-service

EXPOSE 8080

CMD ["./oam-service"]
