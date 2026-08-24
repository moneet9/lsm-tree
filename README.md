# LSM Lab

A local-first C++ LSM-tree storage engine with a React/Vite experiment console.

## Run

1. Build the C++20 engine with CMake from `lsm engine` (or with a C++20 compiler: `g++ -std=c++20 -O2 main.cpp -lws2_32 -o lsm_server.exe`).
2. Start `lsm_server` (it listens on `http://localhost:8080` and stores WAL/SSTables in `./data`).
3. In `frontend`, run `npm install` then `npm run dev`.

On Windows, the easiest C++20 startup is `.uild-and-run-cpp20.ps1` from `lsm engine`. It prefers a modern compiler and refuses to start an old binary if compilation fails. If PowerShell finds the legacy `C:\MinGW\bin\g++.exe` first, use `C:\msys64\ucrt64\bin\g++.exe` or open the MSYS2 UCRT64 terminal.

Copy `lsm engine/.env.example` to `.env` and replace the AWS values only when deploying an S3 adapter. The demo itself measures local WAL/MemTable/SSTable work and never emits CloudWatch metrics. `docker compose up -d` starts the included S3-compatible MinIO service for future object-storage wiring.

The dashboard supports manual PUT/GET/DELETE, tombstone visibility, size-tiered compaction, crash + WAL replay, and configurable P50/P90/P99 benchmark runs.

The backend is a standalone HTTP/JSON process, similar to a Node.js backend: the React app calls `/api/*`, and `/health` is available for a quick health check. It binds to `127.0.0.1` only, so it does not expose your storage engine to the network.

On Windows, a firewall/UAC popup can appear when an executable first opens a listening port. This server does not need an administrator password, AWS password, or account password. Cancel the prompt if Windows asks for broader network access; the app is designed to use localhost.
