#include "memtable.hpp"
#include <algorithm>

SkipListMemTable::SkipListMemTable(size_t height) : maxHeight(std::max<size_t>(2, height)) {
  head = new Node("", Record{}, maxHeight);
}
SkipListMemTable::~SkipListMemTable() { clear(); delete head; }
size_t SkipListMemTable::randomHeight() {
  size_t height = 1;
  while (height < maxHeight && (random() & 3u) == 0u) ++height;
  return height;
}
SkipListMemTable::Node* SkipListMemTable::findNode(const std::string& key) const {
  Node* current = head;
  for (size_t level = maxHeight; level-- > 0;) {
    while (current->next[level] && current->next[level]->key < key) current = current->next[level];
  }
  return current->next[0] && current->next[0]->key == key ? current->next[0] : nullptr;
}
void SkipListMemTable::put(const std::string& key, Record record) {
  std::vector<Node*> previous(maxHeight, head);
  Node* current = head;
  for (size_t level = maxHeight; level-- > 0;) {
    while (current->next[level] && current->next[level]->key < key) current = current->next[level];
    previous[level] = current;
  }
  Node* existing = current->next[0];
  const size_t newBytes = key.size() + record.value.size() + sizeof(Record);
  if (existing && existing->key == key) {
    currentBytes -= existing->key.size() + existing->record.value.size() + sizeof(Record);
    existing->record = std::move(record);
    currentBytes += newBytes;
    return;
  }
  Node* node = new Node(key, std::move(record), randomHeight());
  for (size_t level = 0; level < node->next.size(); ++level) {
    node->next[level] = previous[level]->next[level];
    previous[level]->next[level] = node;
  }
  ++currentSize;
  currentBytes += newBytes;
}
bool SkipListMemTable::get(const std::string& key, Record& record) const {
  Node* node = findNode(key);
  if (!node) return false;
  record = node->record;
  return true;
}
bool SkipListMemTable::erase(const std::string& key) {
  std::vector<Node*> previous(maxHeight, head);
  Node* current = head;
  for (size_t level = maxHeight; level-- > 0;) {
    while (current->next[level] && current->next[level]->key < key) current = current->next[level];
    previous[level] = current;
  }
  Node* node = current->next[0];
  if (!node || node->key != key) return false;
  for (size_t level = 0; level < node->next.size(); ++level) previous[level]->next[level] = node->next[level];
  currentBytes -= node->key.size() + node->record.value.size() + sizeof(Record);
  --currentSize;
  delete node;
  return true;
}
void SkipListMemTable::clear() {
  Node* node = head->next[0];
  while (node) { Node* next = node->next[0]; delete node; node = next; }
  std::fill(head->next.begin(), head->next.end(), nullptr);
  currentSize = currentBytes = 0;
}
std::vector<std::pair<std::string, Record>> SkipListMemTable::snapshot(size_t limit) const {
  std::vector<std::pair<std::string, Record>> result;
  for (Node* node = head->next[0]; node && (!limit || result.size() < limit); node = node->next[0]) result.emplace_back(node->key, node->record);
  return result;
}
