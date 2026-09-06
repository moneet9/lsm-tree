#pragma once
#include "record.hpp"
#include <cstddef>
#include <cstdint>
#include <string>
#include <utility>
#include <vector>

struct TableMeta {
	std::string name, level, minKey, maxKey;
	uint64_t generation = 0, bytes = 0;
	size_t records = 0, indexEntries = 0, bloomBits = 0, bloomRejects = 0;
	std::vector<uint64_t> bloom;
	std::vector<std::pair<std::string, uint64_t>> index;
};
class SSTableStore {
	std::string directory;
	size_t bits;
	std::vector<TableMeta> tableList;
	size_t hash(const std::string& key, size_t seed) const;
	void inspect(const std::string& name, const std::string& level);
public:
	explicit SSTableStore(std::string dir, size_t bloomBitCount = 8192);
	std::string write(const std::vector<std::pair<std::string, Record>>& records, const std::string& level = "L0", uint64_t generation = 0);
	size_t compact();
	bool get(const std::string& key, std::string& value, size_t& bloomRejects, size_t& diskReads);
	std::vector<TableMeta> metadata() const { return tableList; }
	uint64_t maxGeneration() const;
};
