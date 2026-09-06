#pragma once
#include "memtable.hpp"
#include "sstable.hpp"
#include "wal.hpp"
#include <atomic>
#include <cstdint>
#include <mutex>
#include <string>

class Engine {
	std::string directory;
	SkipListMemTable memtable;
	Wal walFile;
	SSTableStore tables;
	mutable std::recursive_mutex mutex;
	uint64_t sequence = 0, logicalBytes = 0, internalBytes = 0, compactionBytes = 0;
	size_t readOperations = 0, readMisses = 0, cacheHits = 0, diskReads = 0, bloomRejects = 0, flushCount = 0;
	size_t memtableLimitBytes() const;
	void recover();
public:
	std::atomic<size_t> pendingRequests{0}, activeRequests{0};
	explicit Engine(std::string dataDirectory);
	void put(const std::string& key, const std::string& value);
	void del(const std::string& key);
	bool get(const std::string& key, std::string& value);
	void flush();
	size_t compact();
	void crashRecover();
	std::string status() const;
	std::string metrics() const;
	std::string wal() const;
	std::string sstables() const;
	std::string config() const;
	void saveConfig(const std::string& body);
	void requestQueued() { pendingRequests.fetch_add(1); }
	void requestStarted() { pendingRequests.fetch_sub(1); activeRequests.fetch_add(1); }
	void requestFinished() { activeRequests.fetch_sub(1); }
};
