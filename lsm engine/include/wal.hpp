#pragma once
#include <cstdint>
#include <string>
#include <vector>

struct WalEntry { uint64_t sequence; std::string operation, key, value; };
class Wal {
	std::string path;
public:
	explicit Wal(std::string filePath);
	uint64_t append(const std::string& operation, const std::string& key, const std::string& value, uint64_t sequence);
	std::vector<WalEntry> replay() const;
	uint64_t bytes() const;
	size_t records() const;
	void truncate();
};
