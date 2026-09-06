#pragma once
#include "record.hpp"
#include <cstddef>
#include <random>
#include <string>
#include <utility>
#include <vector>

class SkipListMemTable {
  struct Node {
    std::string key;
    Record record;
    std::vector<Node*> next;
    Node(std::string k, Record r, size_t height) : key(std::move(k)), record(std::move(r)), next(height, nullptr) {}
  };
  Node* head;
  size_t currentSize = 0;
  size_t currentBytes = 0;
  size_t maxHeight = 8;
  std::mt19937 random{42};
  size_t randomHeight();
  Node* findNode(const std::string& key) const;
public:
  explicit SkipListMemTable(size_t height = 8);
  ~SkipListMemTable();
  SkipListMemTable(const SkipListMemTable&) = delete;
  SkipListMemTable& operator=(const SkipListMemTable&) = delete;
  void put(const std::string& key, Record record);
  bool get(const std::string& key, Record& record) const;
  bool erase(const std::string& key);
  void clear();
  size_t size() const { return currentSize; }
  size_t bytes() const { return currentBytes; }
  size_t levels() const { return maxHeight; }
  std::vector<std::pair<std::string, Record>> snapshot(size_t limit = 0) const;
};
