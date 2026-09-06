#include "wal.hpp"
#include <filesystem>
#include <fstream>
#include <stdexcept>
#ifdef _WIN32
#include <windows.h>
#else
#include <fcntl.h>
#include <unistd.h>
#endif
namespace { void writeExact(std::ofstream& file,const char* data,size_t size){file.write(data,static_cast<std::streamsize>(size));if(!file)throw std::runtime_error("WAL write failed");} void syncFile(const std::string& path){
#ifdef _WIN32
HANDLE handle=CreateFileA(path.c_str(),GENERIC_WRITE,FILE_SHARE_READ|FILE_SHARE_WRITE,nullptr,OPEN_EXISTING,FILE_ATTRIBUTE_NORMAL,nullptr);if(handle==INVALID_HANDLE_VALUE||!FlushFileBuffers(handle)){if(handle!=INVALID_HANDLE_VALUE)CloseHandle(handle);throw std::runtime_error("WAL durability sync failed");}CloseHandle(handle);
#else
int handle=open(path.c_str(),O_WRONLY);if(handle<0||fsync(handle)!=0){if(handle>=0)close(handle);throw std::runtime_error("WAL durability sync failed");}close(handle);
#endif
} }
Wal::Wal(std::string filePath):path(std::move(filePath)){}
uint64_t Wal::append(const std::string& operation,const std::string& key,const std::string& value,uint64_t sequence){std::ofstream file(path,std::ios::binary|std::ios::app);if(!file)throw std::runtime_error("cannot open WAL");uint32_t opSize=static_cast<uint32_t>(operation.size()),keySize=static_cast<uint32_t>(key.size()),valueSize=static_cast<uint32_t>(value.size()),magic=0x4C534D31;writeExact(file,reinterpret_cast<const char*>(&magic),4);writeExact(file,reinterpret_cast<const char*>(&sequence),8);writeExact(file,reinterpret_cast<const char*>(&opSize),4);writeExact(file,reinterpret_cast<const char*>(&keySize),4);writeExact(file,reinterpret_cast<const char*>(&valueSize),4);writeExact(file,operation.data(),opSize);writeExact(file,key.data(),keySize);writeExact(file,value.data(),valueSize);file.flush();if(!file)throw std::runtime_error("WAL flush failed");file.close();syncFile(path);return sequence;}
std::vector<WalEntry> Wal::replay()const{std::vector<WalEntry> entries;std::ifstream file(path,std::ios::binary);while(file.peek()!=std::char_traits<char>::eof()){uint32_t magic=0,opSize=0,keySize=0,valueSize=0;uint64_t sequence=0;file.read(reinterpret_cast<char*>(&magic),4);file.read(reinterpret_cast<char*>(&sequence),8);file.read(reinterpret_cast<char*>(&opSize),4);file.read(reinterpret_cast<char*>(&keySize),4);file.read(reinterpret_cast<char*>(&valueSize),4);if(!file||magic!=0x4C534D31||opSize>1024||keySize>16*1024*1024||valueSize>256*1024*1024)throw std::runtime_error("corrupt WAL record");std::string operation(opSize,'\0'),key(keySize,'\0'),value(valueSize,'\0');file.read(operation.data(),opSize);file.read(key.data(),keySize);file.read(value.data(),valueSize);if(!file)throw std::runtime_error("truncated WAL record");entries.push_back({sequence,std::move(operation),std::move(key),std::move(value)});}return entries;}
uint64_t Wal::bytes() const { std::error_code error; auto value=std::filesystem::file_size(path,error); return error?0:value; }
size_t Wal::records() const { return replay().size(); }
void Wal::truncate() { std::ofstream file(path,std::ios::binary | std::ios::trunc); if (!file) throw std::runtime_error("cannot truncate WAL"); file.flush(); if (!file) throw std::runtime_error("WAL truncate failed"); file.close(); syncFile(path); }
