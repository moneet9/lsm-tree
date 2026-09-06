FROM gcc:14-bookworm AS build
RUN apt-get update && apt-get install -y --no-install-recommends libssl-dev libcurl4-openssl-dev && rm -rf /var/lib/apt/lists/*
WORKDIR /src
COPY include ./include
COPY src ./src
RUN g++ -std=c++20 -O2 src/main.cpp src/engine.cpp src/memtable.cpp src/wal.cpp src/sstable.cpp src/http_server.cpp src/workload.cpp -I include -lcrypto -lpthread -o lsm_server

FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends libstdc++6 libgcc-s1 libssl3 ca-certificates curl && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=build /src/lsm_server .
RUN mkdir -p /data
ENV LSM_PORT=8080 LSM_DATA_DIR=/data
EXPOSE 8080
CMD ["/app/lsm_server"]
