#pragma once
#include <string>
class Engine;
std::string runWorkload(Engine& engine, int operations, int readRatio, int deleteRatio, int keySpace, int payloadSize);
std::string runBenchmark(Engine& engine, int operations, int readRatio, int keySpace, int payloadSize, int crashAt);
