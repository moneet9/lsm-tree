#include "http_server.hpp"
#include "workload.hpp"
#include <algorithm>
#include <condition_variable>
#include <deque>
#include <mutex>
#include <sstream>
#include <stdexcept>
#include <thread>
#ifdef _WIN32
#include <winsock2.h>
using socket_t = SOCKET;
#else
#include <arpa/inet.h>
#include <netinet/in.h>
#include <sys/socket.h>
#include <unistd.h>
using socket_t = int;
#endif
namespace {
void closeSocket(socket_t s) {
#ifdef _WIN32
  closesocket(s);
#else
  close(s);
#endif
}
std::string escape(const std::string& value) { std::string out; for (char c : value) { if (c == '\\') out += "\\\\"; else if (c == '"') out += "\\\""; else if (c == '\n') out += "\\n"; else if (c == '\r') out += "\\r"; else out += c; } return out; }
std::string decode(const std::string& value) { std::string out; for (size_t i = 0; i < value.size(); ++i) { if (value[i] == '%' && i + 2 < value.size()) { out += static_cast<char>(std::stoi(value.substr(i + 1, 2), nullptr, 16)); i += 2; } else out += value[i] == '+' ? ' ' : value[i]; } return out; }
std::string field(const std::string& body, const std::string& name, const std::string& fallback = "") { auto p = body.find("\"" + name + "\""); if (p == std::string::npos) return fallback; p = body.find(':', p); if (p == std::string::npos) return fallback; ++p; while (p < body.size() && (body[p] == ' ' || body[p] == '\t')) ++p; if (p < body.size() && body[p] == '"') { ++p; std::string result; bool escaped = false; for (; p < body.size(); ++p) { if (escaped) { result += body[p]; escaped = false; } else if (body[p] == '\\') escaped = true; else if (body[p] == '"') break; else result += body[p]; } return result; } auto end = body.find_first_of(",}", p); return body.substr(p, end == std::string::npos ? body.size() - p : end - p); }
int number(const std::string& body, const std::string& name, int fallback) { try { return std::stoi(field(body, name, std::to_string(fallback))); } catch (...) { return fallback; } }
std::string makeResponse(int code, const std::string& reason, const std::string& body) { return "HTTP/1.1 " + std::to_string(code) + " " + reason + "\r\nContent-Type: application/json\r\nAccess-Control-Allow-Origin: *\r\nAccess-Control-Allow-Methods: GET, POST, OPTIONS\r\nAccess-Control-Allow-Headers: Content-Type\r\nContent-Length: " + std::to_string(body.size()) + "\r\nConnection: close\r\n\r\n" + body; }
struct Request { std::string method, target, body; };
Request readRequest(socket_t socket) { std::string raw; char buffer[4096]; size_t headerEnd = std::string::npos; size_t length = 0; while (headerEnd == std::string::npos) { int count = recv(socket, buffer, sizeof(buffer), 0); if (count <= 0) throw std::runtime_error("incomplete request headers"); raw.append(buffer, count); headerEnd = raw.find("\r\n\r\n"); if (raw.size() > 1024 * 1024) throw std::runtime_error("request headers too large"); } auto headers = raw.substr(0, headerEnd); auto marker = headers.find("Content-Length:"); if (marker == std::string::npos) marker = headers.find("content-length:"); if (marker != std::string::npos) { marker += 15; while (marker < headers.size() && (headers[marker] == ' ' || headers[marker] == '\t')) ++marker; auto end = headers.find("\r\n", marker); length = std::stoull(headers.substr(marker, end == std::string::npos ? end : end - marker)); } if (length > 64 * 1024 * 1024) throw std::runtime_error("request body too large"); auto bodyStart = headerEnd + 4; while (raw.size() - bodyStart < length) { int count = recv(socket, buffer, sizeof(buffer), 0); if (count <= 0) throw std::runtime_error("incomplete request body"); raw.append(buffer, count); } std::istringstream line(raw.substr(0, raw.find("\r\n"))); Request request; line >> request.method >> request.target; request.body = raw.substr(bodyStart, length); return request; }
void handle(socket_t socket, Engine& engine) { engine.requestStarted(); try { auto request = readRequest(socket); int code = 200; std::string reason = "OK", body = "{}"; if (request.method == "OPTIONS") {} else if (request.method == "GET" && request.target == "/health") body = "{\"ok\":true}"; else if (request.method == "GET" && request.target == "/api/status") body = engine.status(); else if (request.method == "GET" && request.target == "/api/metrics") body = engine.metrics(); else if (request.method == "GET" && request.target == "/api/wal") body = engine.wal(); else if (request.method == "GET" && request.target == "/api/sstables") body = engine.sstables(); else if (request.method == "GET" && request.target == "/api/config") body = engine.config(); else if (request.method == "GET" && request.target.rfind("/api/get?key=", 0) == 0) { auto key = decode(request.target.substr(13)); std::string value; body = engine.get(key, value) ? "{\"found\":true,\"key\":\"" + escape(key) + "\",\"value\":\"" + escape(value) + "\"}" : "{\"found\":false,\"key\":\"" + escape(key) + "\"}"; } else if (request.method == "POST" && request.target == "/api/put") { engine.put(field(request.body, "key"), field(request.body, "value")); body = "{\"ok\":true}"; } else if (request.method == "POST" && request.target == "/api/delete") { engine.del(field(request.body, "key")); body = "{\"ok\":true,\"tombstone\":true}"; } else if (request.method == "POST" && request.target == "/api/compact") body = "{\"ok\":true,\"tombstonesRemoved\":" + std::to_string(engine.compact()) + "}"; else if (request.method == "POST" && request.target == "/api/crash") { engine.crashRecover(); body = "{\"ok\":true,\"recoveredFromWal\":true}"; } else if (request.method == "POST" && request.target == "/api/simulate") body = runWorkload(engine, number(request.body, "operations", 1000), number(request.body, "readRatio", 50), number(request.body, "deleteRatio", 20), number(request.body, "keySpace", 1000), number(request.body, "payloadSize", 100)); else if (request.method == "POST" && request.target == "/api/benchmark") body = runBenchmark(engine, number(request.body, "operations", 1000), number(request.body, "readRatio", 70), number(request.body, "keySpace", 1000), number(request.body, "payloadSize", 100), number(request.body, "crashAt", 0)); else if (request.method == "POST" && request.target == "/api/config") { engine.saveConfig(request.body); body = "{\"ok\":true}"; } else { code = 404; reason = "Not Found"; body = "{\"error\":\"not found\"}"; } auto output = makeResponse(code, reason, body); if (send(socket, output.data(), static_cast<int>(output.size()), 0) < 0) throw std::runtime_error("send failed"); } catch (const std::exception& error) { auto output = makeResponse(400, "Bad Request", "{\"error\":\"" + escape(error.what()) + "\"}"); send(socket, output.data(), static_cast<int>(output.size()), 0); } closeSocket(socket); engine.requestFinished(); }
}
void runHttpServer(Engine& engine, int port) {
#ifdef _WIN32
  WSADATA data; if (WSAStartup(MAKEWORD(2, 2), &data) != 0) throw std::runtime_error("WSAStartup failed");
#endif
  socket_t server = socket(AF_INET, SOCK_STREAM, 0); if (server < 0) throw std::runtime_error("socket failed"); sockaddr_in address{}; address.sin_family = AF_INET; address.sin_addr.s_addr = htonl(INADDR_LOOPBACK); address.sin_port = htons(static_cast<unsigned short>(port)); int option = 1; setsockopt(server, SOL_SOCKET, SO_REUSEADDR, reinterpret_cast<const char*>(&option), sizeof(option)); if (bind(server, reinterpret_cast<sockaddr*>(&address), sizeof(address)) < 0) throw std::runtime_error("bind failed"); if (listen(server, 4096) < 0) throw std::runtime_error("listen failed"); std::mutex mutex; std::condition_variable ready; std::deque<socket_t> queue; std::vector<std::thread> workers; auto count = std::max(4u, std::min(32u, std::thread::hardware_concurrency() ? std::thread::hardware_concurrency() : 4u)); for (unsigned i = 0; i < count; ++i) workers.emplace_back([&] { for (;;) { socket_t client; { std::unique_lock lock(mutex); ready.wait(lock, [&] { return !queue.empty(); }); client = queue.front(); queue.pop_front(); } handle(client, engine); } }); for (;;) { socket_t client = accept(server, nullptr, nullptr); if (client < 0) continue; std::lock_guard lock(mutex); if (queue.size() < 4096) { queue.push_back(client); engine.requestQueued(); ready.notify_one(); } else closeSocket(client); }
}
