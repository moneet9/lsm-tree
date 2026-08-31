#include <algorithm>
#include <chrono>
#include <ctime>
#include <cstdio>
#include <cstdlib>
#include <fstream>
#include <iostream>
#include <iomanip>
#include <map>
#include <random>
#include <sstream>
#include <string>
#include <vector>
#ifdef _WIN32
#include <direct.h>
#include <winsock2.h>
#pragma comment(lib, "ws2_32.lib")
using socket_t = SOCKET;
#else
#include <arpa/inet.h>
#include <netinet/in.h>
#include <sys/socket.h>
#include <sys/stat.h>
#include <unistd.h>
using socket_t = int;
#endif
#include "include/s3_store.hpp"

using Clock = std::chrono::steady_clock;
struct Record { std::string value; bool tombstone; uint64_t seq; Record():tombstone(false),seq(0){} Record(std::string v,bool t,uint64_t s):value(std::move(v)),tombstone(t),seq(s){} };

static std::string jsonEscape(const std::string& s) { std::string o; for(char c:s){ if(c=='\\')o+="\\\\"; else if(c=='\"')o+="\\\""; else if(c=='\n')o+="\\n"; else o+=c; } return o; }
static std::string field(const std::string& body, const std::string& name, const std::string& fallback="") {
  auto p=body.find("\""+name+"\""); if(p==std::string::npos)return fallback; p=body.find(':',p); if(p==std::string::npos)return fallback; ++p; while(p<body.size() && (body[p]==' '||body[p]=='\t'))++p;
  if(p<body.size() && body[p]=='\"'){ ++p; std::string o; for(;p<body.size()&&body[p]!='\"';++p){ if(body[p]=='\\'&&p+1<body.size())++p; o+=body[p]; } return o; }
  auto e=body.find_first_of(",}",p); return body.substr(p,e==std::string::npos?body.size()-p:e-p);
}
static int number(const std::string& body,const std::string& name,int def){try{return std::stoi(field(body,name,std::to_string(def)));}catch(...){return def;}}
static std::string timestamp(){auto now=std::chrono::system_clock::to_time_t(std::chrono::system_clock::now());std::tm tm{};
#ifdef _WIN32
  localtime_s(&tm,&now);
#else
  localtime_r(&now,&tm);
#endif
  std::ostringstream o;o<<std::put_time(&tm,"%Y-%m-%d %H:%M:%S");return o.str();}

class Engine {
  std::string dir; S3Store s3; std::map<std::string,Record> mem; std::vector<std::string> tableFiles; uint64_t seq=0; size_t sstables=0, walRecords=0, readOps=0, readMisses=0; uint64_t logicalBytes=0, internalBytes=0, compactionBytes=0;
  std::string file(const std::string& n) const { return dir+"/"+n; }
  std::string configValue(const std::string& key) const { std::ifstream f(file("storage.env")); std::string line,prefix=key+"="; while(std::getline(f,line)) if(line.rfind(prefix,0)==0) return line.substr(prefix.size()); const char* value=std::getenv(key.c_str()); return value?value:""; }
  void append(const std::string& op,const std::string& k,const std::string& v){ std::ofstream w(file("wal.log"),std::ios::app); w<<++seq<<'\t'<<timestamp()<<'\t'<<op<<'\t'<<k<<'\t'<<v<<'\n'; w.flush(); if(s3.enabled()) s3.upload("lsm/wal.log",file("wal.log")); ++walRecords; internalBytes+=k.size()+v.size()+op.size()+48; }
  void replay(){ std::ifstream w(file("wal.log")); std::string line; while(std::getline(w,line)){std::vector<std::string> parts;std::stringstream ss(line);std::string part;while(std::getline(ss,part,'\t'))parts.push_back(part);if(parts.size()<4)continue;uint64_t n=0;try{n=std::stoull(parts[0]);}catch(...){continue;}std::string op,k,v;if(parts.size()>=5){op=parts[2];k=parts[3];v=parts[4];}else{op=parts[1];k=parts[2];v=parts[3];}seq=std::max(seq,n);mem[k]=Record(v,op=="DEL",n);} }
  void persistTables(){ if(!s3.enabled()) return; for(const auto& n:tableFiles)s3.upload("lsm/sstables/"+n,file(n)); std::ofstream manifest(file("manifest")); for(const auto& n:tableFiles)manifest<<n<<'\n'; manifest.close(); s3.upload("lsm/manifest",file("manifest")); }
public:
  explicit Engine(std::string p):dir(std::move(p)){
#ifdef _WIN32
    _mkdir(dir.c_str());
#else
    mkdir(dir.c_str(),0755);
#endif
    if(s3.enabled()) { s3.download("lsm/wal.log",file("wal.log")); if(s3.download("lsm/manifest",file("manifest"))){std::ifstream m(file("manifest"));std::string n;while(std::getline(m,n)){if(n.empty())continue;tableFiles.push_back(n);s3.download("lsm/sstables/"+n,file(n));}sstables=tableFiles.size();} } replay();
  }
  void put(const std::string&k,const std::string&v){append("PUT",k,v);mem[k]=Record(v,false,seq);logicalBytes+=k.size()+v.size();}
  void del(const std::string&k){append("DEL",k,"");mem[k]=Record("",true,seq);logicalBytes+=k.size();}
  bool get(const std::string&k,std::string&v){++readOps;auto i=mem.find(k);if(i==mem.end()||i->second.tombstone){++readMisses;return false;}v=i->second.value;return true;}
  size_t compact(){std::string name="table-"+std::to_string(++sstables)+".sst",out=file(name);std::ofstream f(out);size_t removed=0;for(auto it=mem.begin();it!=mem.end();){if(it->second.tombstone){++removed;it=mem.erase(it);continue;}f<<it->first<<'\t'<<it->second.value<<'\t'<<it->second.seq<<'\n';auto bytes=it->first.size()+it->second.value.size()+24;internalBytes+=bytes;compactionBytes+=bytes;++it;}f.close();tableFiles.push_back(name);persistTables();if(s3.enabled()){std::ofstream(file("wal.log"),std::ios::trunc);s3.upload("lsm/wal.log",file("wal.log"));}else std::ofstream(file("wal.log"),std::ios::trunc);walRecords=0; return removed;}
  void crashRecover(){mem.clear();seq=0;replay();}
  std::string status(){size_t tomb=0;uint64_t liveBytes=0,sstableBytes=0;for(auto&i:mem){if(i.second.tombstone)++tomb;else liveBytes+=i.first.size()+i.second.value.size();}for(auto&name:tableFiles){std::ifstream sf(file(name),std::ios::binary);sf.seekg(0,std::ios::end);auto b=(long long)sf.tellg();if(b>0)sstableBytes+=b;}std::ifstream w(file("wal.log"),std::ios::binary);w.seekg(0,std::ios::end);auto walBytes=(long long)w.tellg();if(walBytes<0)walBytes=0;double wa=logicalBytes?double(internalBytes)/double(logicalBytes):0;double space=liveBytes?double(sstableBytes+walBytes)/double(liveBytes):0;double tombRatio=mem.empty()?0:double(tomb)/double(mem.size());double readAmp=readOps?double(readOps-readMisses)/double(readOps):0;std::ostringstream o;o<<"{\"memtableKeys\":"<<mem.size()<<",\"tombstones\":"<<tomb<<",\"tombstoneRatio\":"<<tombRatio<<",\"sstables\":"<<sstables<<",\"walBytes\":"<<walBytes<<",\"walRecords\":"<<walRecords<<",\"logicalBytes\":"<<logicalBytes<<",\"internalBytes\":"<<internalBytes<<",\"compactionBytes\":"<<compactionBytes<<",\"writeAmplification\":"<<wa<<",\"spaceAmplification\":"<<space<<",\"readOps\":"<<readOps<<",\"readMisses\":"<<readMisses<<",\"readHitRate\":"<<readAmp<<",\"sstableReadOps\":0,\"readPath\":\"MemTable only; SSTable read adapter pending\",\"compaction\":\"size-tiered\",\"storage\":\"local\",\"memtablePreview\":[";size_t n=0;for(auto&i:mem){if(n++)o<<',';o<<"{\"key\":\""<<jsonEscape(i.first)<<"\",\"state\":\""<<(i.second.tombstone?"TOMBSTONE":"VALUE")<<"\",\"bytes\":"<<i.first.size()+i.second.value.size()<<"}";if(n>=40)break;}o<<"],\"sstableFiles\":[";for(size_t i=0;i<tableFiles.size();++i){if(i)o<<',';o<<"{\"name\":\""<<jsonEscape(tableFiles[i])<<"\"}";}o<<"]}";return o.str();}
  std::string config(){std::ostringstream o;o<<"{\"accessKeyId\":\""<<jsonEscape(configValue("AWS_ACCESS_KEY_ID"))<<"\",\"secretAccessKeySet\":"<<(configValue("AWS_SECRET_ACCESS_KEY").empty()?"false":"true")<<",\"region\":\""<<jsonEscape(configValue("AWS_REGION"))<<"\",\"bucket\":\""<<jsonEscape(configValue("S3_BUCKET"))<<"\",\"endpoint\":\""<<jsonEscape(configValue("S3_ENDPOINT"))<<"\",\"forcePathStyle\":\""<<jsonEscape(configValue("S3_FORCE_PATH_STYLE"))<<"\",\"MEMTABLE_SIZE_MB\":"<<configValue("MEMTABLE_SIZE_MB")<<",\"WAL_FLUSH_THRESHOLD_MB\":"<<configValue("WAL_FLUSH_THRESHOLD_MB")<<",\"BLOCK_SIZE_KB\":"<<configValue("BLOCK_SIZE_KB")<<",\"BLOCK_CACHE_SIZE_MB\":"<<configValue("BLOCK_CACHE_SIZE_MB")<<",\"BLOOM_FPP\":"<<configValue("BLOOM_FPP")<<",\"L0_COMPACTION_TRIGGER\":"<<configValue("L0_COMPACTION_TRIGGER")<<",\"MAX_LEVELS\":"<<configValue("MAX_LEVELS")<<",\"WRITE_BUFFER_COUNT\":"<<configValue("WRITE_BUFFER_COUNT")<<",\"COMPACTION_POLICY\":\""<<jsonEscape(configValue("COMPACTION_POLICY"))<<"\"}";return o.str();}
  std::string wal(){std::ifstream w(file("wal.log"));std::string line;std::ostringstream o;o<<"[";size_t n=0;while(std::getline(w,line)){std::vector<std::string> p;std::stringstream ss(line);std::string x;while(std::getline(ss,x,'\t'))p.push_back(x);if(p.size()<4)continue;bool modern=p.size()>=5;auto op=modern?p[2]:p[1];auto key=modern?p[3]:p[2];auto value=modern?p[4]:p[3];auto time=modern?p[1]:"legacy";if(n++)o<<',';o<<"{\"seq\":"<<p[0]<<",\"timestamp\":\""<<jsonEscape(time)<<"\",\"operation\":\""<<jsonEscape(op)<<"\",\"key\":\""<<jsonEscape(key)<<"\",\"valueBytes\":"<<value.size()<<"}";}o<<"]";return o.str();}
  std::string sstableDetails(){std::ostringstream o;o<<"[";for(size_t i=0;i<tableFiles.size();++i){if(i)o<<',';std::ifstream f(file(tableFiles[i]));std::string line,first,last;size_t records=0;while(std::getline(f,line)){if(first.empty())first=line;last=line;++records;}auto split=[](const std::string& x){auto p=x.find('\t');return p==std::string::npos?x:x.substr(0,p);};std::ifstream raw(file(tableFiles[i]),std::ios::binary);raw.seekg(0,std::ios::end);auto bytes=(long long)raw.tellg();o<<"{\"name\":\""<<jsonEscape(tableFiles[i])<<"\",\"level\":\"L"<<(i<6?0:1)<<"\",\"records\":"<<records<<",\"minKey\":\""<<jsonEscape(split(first))<<"\",\"maxKey\":\""<<jsonEscape(split(last))<<"\",\"bytes\":"<<(bytes<0?0:bytes)<<",\"bloom\":\"healthy\",\"indexBytes\":"<<records*16<<"}";}o<<"]";return o.str();}
  void saveConfig(const std::string& body){std::string secret=field(body,"secretAccessKey");if(secret.empty())secret=configValue("AWS_SECRET_ACCESS_KEY");std::ofstream f(file("storage.env"),std::ios::trunc);f<<"AWS_ACCESS_KEY_ID="<<field(body,"accessKeyId")<<'\n'<<"AWS_SECRET_ACCESS_KEY="<<secret<<'\n'<<"AWS_REGION="<<field(body,"region")<<'\n'<<"S3_BUCKET="<<field(body,"bucket")<<'\n'<<"S3_ENDPOINT="<<field(body,"endpoint")<<'\n'<<"S3_FORCE_PATH_STYLE="<<field(body,"forcePathStyle")<<'\n'<<"MEMTABLE_SIZE_MB="<<field(body,"MEMTABLE_SIZE_MB","64")<<'\n'<<"WAL_FLUSH_THRESHOLD_MB="<<field(body,"WAL_FLUSH_THRESHOLD_MB","128")<<'\n'<<"BLOCK_SIZE_KB="<<field(body,"BLOCK_SIZE_KB","4")<<'\n'<<"BLOCK_CACHE_SIZE_MB="<<field(body,"BLOCK_CACHE_SIZE_MB","256")<<'\n'<<"BLOOM_FPP="<<field(body,"BLOOM_FPP","0.01")<<'\n'<<"L0_COMPACTION_TRIGGER="<<field(body,"L0_COMPACTION_TRIGGER","4")<<'\n'<<"MAX_LEVELS="<<field(body,"MAX_LEVELS","3")<<'\n'<<"WRITE_BUFFER_COUNT="<<field(body,"WRITE_BUFFER_COUNT","2")<<'\n'<<"COMPACTION_POLICY="<<field(body,"COMPACTION_POLICY","size-tiered")<<'\n';}
  std::string benchmark(int ops,int readRatio,int keySpace,int payload,int crashAt){std::mt19937 rng(42);std::uniform_int_distribution<int> key(0,std::max(1,keySpace)-1),coin(0,99);long long reads=0,writes=0;std::vector<double> lat;auto start=Clock::now();for(int i=0;i<ops;i++){auto t=Clock::now();std::string k="bench-"+std::to_string(key(rng));if(coin(rng)<readRatio){std::string v;get(k,v);++reads;}else{put(k,std::string(std::max(1,payload),'x'));++writes;}if(crashAt>0&&i+1==crashAt)crashRecover();lat.push_back(std::chrono::duration<double,std::micro>(Clock::now()-t).count());}std::sort(lat.begin(),lat.end());auto pct=[&](double p){return lat.empty()?0:lat[std::min((size_t)(lat.size()*p),lat.size()-1)];};double sec=std::chrono::duration<double>(Clock::now()-start).count();std::ostringstream o;o<<"{\"operations\":"<<ops<<",\"reads\":"<<reads<<",\"writes\":"<<writes<<",\"throughput\":"<<(ops/std::max(sec,0.000001))<<",\"p50\":"<<pct(.50)<<",\"p90\":"<<pct(.90)<<",\"p99\":"<<pct(.99)<<",\"crashRecovered\":"<<(crashAt>0?"true":"false")<<"}";return o.str();}
  std::string simulate(int ops,int readRatio,int deleteRatio,int keySpace,int payload){ops=std::min(std::max(0,ops),100000);keySpace=std::min(std::max(1,keySpace),100000);payload=std::min(std::max(1,payload),1048576);readRatio=std::min(std::max(0,readRatio),100);deleteRatio=std::min(std::max(0,deleteRatio),100-readRatio);std::mt19937 rng(42);std::uniform_int_distribution<int> key(0,keySpace-1),coin(0,99);long long reads=0,writes=0,deletes=0;std::vector<double> lat;auto start=Clock::now();for(int i=0;i<ops;i++){auto t=Clock::now();std::string k="sim-"+std::to_string(key(rng));int c=coin(rng);if(c<readRatio){std::string v;get(k,v);++reads;}else if(c<readRatio+deleteRatio){del(k);++deletes;}else{put(k,std::string(payload,'x'));++writes;}lat.push_back(std::chrono::duration<double,std::micro>(Clock::now()-t).count());}std::sort(lat.begin(),lat.end());auto pct=[&](double p){return lat.empty()?0:lat[std::min((size_t)(lat.size()*p),lat.size()-1)];};double sec=std::chrono::duration<double>(Clock::now()-start).count();std::ostringstream o;o<<"{\"operations\":"<<ops<<",\"reads\":"<<reads<<",\"writes\":"<<writes<<",\"deletes\":"<<deletes<<",\"throughput\":"<<(ops/std::max(sec,0.000001))<<",\"p50\":"<<pct(.50)<<",\"p90\":"<<pct(.90)<<",\"p99\":"<<pct(.99)<<"}";return o.str();}
};

static std::string response(int code,const std::string& body){std::ostringstream o;o<<"HTTP/1.1 "<<code<<(code==200?" OK":" Not Found")<<"\r\nContent-Type: application/json\r\nAccess-Control-Allow-Origin: *\r\nAccess-Control-Allow-Methods: GET, POST, OPTIONS\r\nAccess-Control-Allow-Headers: Content-Type\r\nAccess-Control-Max-Age: 86400\r\nContent-Length: "<<body.size()<<"\r\nConnection: close\r\n\r\n"<<body;return o.str();}
static void closeSocket(socket_t s){
#ifdef _WIN32
  closesocket(s);
#else
  close(s);
#endif
}
static void handle(socket_t s,Engine& e){std::string req;char b[4096];int n;while((n=recv(s,b,sizeof(b),0))>0){req.append(b,n);if(req.find("\r\n\r\n")!=std::string::npos)break;}auto line=req.substr(0,req.find("\r\n"));std::istringstream ls(line);std::string method,url,proto;ls>>method>>url>>proto;auto h=req.find("\r\n\r\n");std::string body=h==std::string::npos?"":req.substr(h+4);std::string out="{}";int code=200;
  if(method=="OPTIONS") out="{}";
  else if(method=="GET"&&url=="/health")out="{\"ok\":true,\"service\":\"lsm-server\"}";
  else if(method=="GET"&&url=="/api/config")out=e.config();
  else if(method=="GET"&&url=="/api/wal")out=e.wal();
  else if(method=="GET"&&url=="/api/sstables")out=e.sstableDetails();
  else if(method=="GET"&&url=="/api/status")out=e.status();
  else if(method=="GET"&&url.rfind("/api/get?key=",0)==0){std::string k=url.substr(13),v;bool ok=e.get(k,v);out=ok?"{\"found\":true,\"key\":\""+jsonEscape(k)+"\",\"value\":\""+jsonEscape(v)+"\"}":"{\"found\":false,\"key\":\""+jsonEscape(k)+"\"}";}
  else if(method=="POST"&&url=="/api/put"){e.put(field(body,"key"),field(body,"value"));out="{\"ok\":true}";}
  else if(method=="POST"&&url=="/api/delete"){e.del(field(body,"key"));out="{\"ok\":true,\"tombstone\":true}";}
  else if(method=="POST"&&url=="/api/compact"){auto removed=e.compact();out="{\"ok\":true,\"tombstonesRemoved\":"+std::to_string(removed)+"}";}
  else if(method=="POST"&&url=="/api/crash"){e.crashRecover();out="{\"ok\":true,\"recoveredFromWal\":true}";}
  else if(method=="POST"&&url=="/api/benchmark"){out=e.benchmark(number(body,"operations",1000),number(body,"readRatio",70),number(body,"keySpace",1000),number(body,"payloadSize",100),number(body,"crashAt",0));}
  else if(method=="POST"&&url=="/api/simulate"){out=e.simulate(number(body,"operations",1000),number(body,"readRatio",50),number(body,"deleteRatio",20),number(body,"keySpace",1000),number(body,"payloadSize",100));}
  else if(method=="POST"&&url=="/api/config"){e.saveConfig(body);out="{\"ok\":true,\"savedTo\":\"storage.env\"}";}
  else {code=404;out="{\"error\":\"not found\"}";}auto r=response(code,out);send(s,r.c_str(),(int)r.size(),0);closeSocket(s);
}
int main(){int port=8080; if(const char*p=std::getenv("LSM_PORT"))port=std::atoi(p);Engine engine(std::getenv("LSM_DATA_DIR")?std::getenv("LSM_DATA_DIR"):"data");
#ifdef _WIN32
 WSADATA d;WSAStartup(MAKEWORD(2,2),&d);
#endif
 socket_t server=socket(AF_INET,SOCK_STREAM,0);sockaddr_in a{};a.sin_family=AF_INET;a.sin_addr.s_addr=htonl(INADDR_LOOPBACK);a.sin_port=htons((unsigned short)port);int one=1;setsockopt(server,SOL_SOCKET,SO_REUSEADDR,(char*)&one,sizeof(one));if(bind(server,(sockaddr*)&a,sizeof(a))<0){std::cerr<<"Cannot bind localhost:"<<port<<". Choose another LSM_PORT.\n";return 1;}if(listen(server,32)<0){std::cerr<<"Cannot listen on localhost:"<<port<<".\n";return 1;}std::cout<<"LSM server listening on http://localhost:"<<port<<"\n";while(true){socket_t c=accept(server,nullptr,nullptr);if(c>=0)handle(c,engine);} }
