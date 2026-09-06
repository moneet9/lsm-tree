#pragma once
#include <cstdint>
#include <string>

struct Record {
  std::string value;
  bool tombstone = false;
  uint64_t sequence = 0;
};
