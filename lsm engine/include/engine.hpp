#pragma once
#include "memtable.hpp"
#include "sstable.hpp"
#include "wal.hpp"
#include <atomic>
#include <cstdint>
#include <mutex>
#include <string>
#include <thread>
#include <unordered_map>
#include <list>
#include <array>
#include <chrono>

class Engine {
	std::string directory;
	SkipListMemTable memtable;
	Wal walFile;
	SSTableStore tables;
	mutable std::recursive_mutex mutex;
	uint64_t sequence = 0, logicalBytes = 0, internalBytes = 0, compactionBytes = 0;
	size_t readOperations = 0, writeOperations = 0, readMisses = 0, cacheHits = 0, diskReads = 0, bloomRejects = 0, flushCount = 0;
	uint64_t writeLatencyTotalUs = 0, readLatencyTotalUs = 0;
	std::chrono::steady_clock::time_point startedAt = std::chrono::steady_clock::now();
	std::array<size_t, 9> writeLatencyBuckets{}, readLatencyBuckets{};
	size_t compactionCount = 0;
	std::list<std::string> cacheOrder;
	std::unordered_map<std::string, std::pair<std::string, std::list<std::string>::iterator>> blockCache;
	std::thread simulator;
	std::atomic<bool> simulationRunning{false};
	std::atomic<bool> simulationStop{false};
	std::atomic<int> simulationFrequencyMs{250};
	std::atomic<int> simulationPayloadBytes{256};
	std::atomic<int> simulationKeySpace{1000};
	std::atomic<int> simulationSpeedPercent{100};
	std::atomic<int> simulationReadPercent{20};
	std::atomic<int> simulationDeletePercent{10};
	std::array<std::atomic<int>, 7> sensorRates{{1, 1, 1, 5, 10, 1, 50}};
	std::array<std::atomic<bool>, 7> sensorEnabled{{true, true, true, true, true, true, true}};
	std::atomic<size_t> simulationWrites{0}, simulationReads{0};
	std::string simulationError;
	void simulationLoop();
	void recordLatency(std::array<size_t, 9>& buckets, uint64_t& totalUs, uint64_t micros);
	uint64_t percentile(const std::array<size_t, 9>& buckets, double quantile) const;
	size_t memtableLimitBytes() const;
	void recover();
public:
	std::atomic<size_t> pendingRequests{0}, activeRequests{0};
	explicit Engine(std::string dataDirectory);
	~Engine();
	uint64_t put(const std::string& key, const std::string& value);
	uint64_t del(const std::string& key);
	bool get(const std::string& key, std::string& value);
	std::string getTrace(const std::string& key);
	void flush(bool runAutomaticCompaction = true);
	std::string compact();
	std::string crashRecover();
	void clearAll();
	std::string status() const;
	std::string metrics() const;
	std::string wal() const;
	std::string sstables() const;
	std::string sstableDetail(const std::string& name, const std::string& key = "") const;
	std::string config() const;
	void saveConfig(const std::string& body);
	void startSimulation(int frequencyMs, int payloadBytes, int keySpace);
	void startSimulation(const std::string& configuration);
	void stopSimulation();
	void resetSimulation();
	void requestQueued() { pendingRequests.fetch_add(1); }
	void requestStarted() { pendingRequests.fetch_sub(1); activeRequests.fetch_add(1); }
	void requestFinished() { activeRequests.fetch_sub(1); }
};
