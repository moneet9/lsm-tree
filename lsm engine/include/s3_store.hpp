#pragma once

#include <algorithm>
#include <chrono>
#include <ctime>
#include <cstdlib>
#include <filesystem>
#include <fstream>
#include <iomanip>
#include <sstream>
#include <string>
#include <vector>

#ifdef _WIN32
#include <windows.h>
#include <bcrypt.h>
#else
#include <openssl/hmac.h>
#include <openssl/sha.h>
#endif

// Small dependency-light S3 client. It uses curl for HTTP and implements the
// AWS Signature V4 protocol so the same engine works with MinIO and AWS S3.
class S3Store {
  std::string accessKey, secretKey, region, bucket, endpoint;
  bool pathStyle = true;
  static std::string hex(const std::vector<unsigned char>& bytes) { std::ostringstream o; for (auto b : bytes) o << std::hex << std::setw(2) << std::setfill('0') << (int)b; return o.str(); }
  static std::vector<unsigned char> sha(const std::string& value) {
    std::vector<unsigned char> out(32);
#ifdef _WIN32
    BCRYPT_ALG_HANDLE alg{}; BCRYPT_HASH_HANDLE hash{}; DWORD cb=0, obj=0;
    if (BCryptOpenAlgorithmProvider(&alg, BCRYPT_SHA256_ALGORITHM, nullptr, 0) != 0) return {};
    BCryptGetProperty(alg, BCRYPT_OBJECT_LENGTH, reinterpret_cast<PUCHAR>(&obj), sizeof(obj), &cb, 0); std::vector<unsigned char> state(obj);
    BCryptCreateHash(alg, &hash, state.data(), obj, nullptr, 0, 0); BCryptHashData(hash, (PUCHAR)value.data(), (ULONG)value.size(), 0); BCryptFinishHash(hash, out.data(), 32, 0); BCryptDestroyHash(hash); BCryptCloseAlgorithmProvider(alg, 0);
#else
    SHA256(reinterpret_cast<const unsigned char*>(value.data()), value.size(), out.data());
#endif
    return out;
  }
  static std::vector<unsigned char> hmac(const std::vector<unsigned char>& key, const std::string& value) {
#ifdef _WIN32
    BCRYPT_ALG_HANDLE alg{}; BCRYPT_HASH_HANDLE hash{}; DWORD cb=0, obj=0; std::vector<unsigned char> out(32);
    if (BCryptOpenAlgorithmProvider(&alg, BCRYPT_SHA256_ALGORITHM, nullptr, BCRYPT_ALG_HANDLE_HMAC_FLAG) != 0) return {};
    BCryptGetProperty(alg, BCRYPT_OBJECT_LENGTH, reinterpret_cast<PUCHAR>(&obj), sizeof(obj), &cb, 0); std::vector<unsigned char> state(obj);
    BCryptCreateHash(alg, &hash, state.data(), obj, const_cast<PUCHAR>(key.data()), (ULONG)key.size(), 0); BCryptHashData(hash, (PUCHAR)value.data(), (ULONG)value.size(), 0); BCryptFinishHash(hash, out.data(), 32, 0); BCryptDestroyHash(hash); BCryptCloseAlgorithmProvider(alg, 0); return out;
#else
    unsigned int n=0; unsigned char* p=HMAC(EVP_sha256(),key.data(),(int)key.size(),reinterpret_cast<const unsigned char*>(value.data()),value.size(),nullptr,&n); return std::vector<unsigned char>(p,p+n);
#endif
  }
  static std::string envOr(const std::string& key, const std::string& fallback) { const char* p=std::getenv(key.c_str()); return p && *p ? p : fallback; }
  static std::string quote(const std::string& s) { std::string o="\""; for(char c:s){if(c=='\"')o+="\\\"";else o+=c;} return o+"\""; }
  bool configured() const { return !accessKey.empty() && !secretKey.empty() && !bucket.empty() && !endpoint.empty(); }
  std::string host() const { auto p=endpoint.find("//"); auto start=p==std::string::npos?0:p+2; auto end=endpoint.find('/',start); auto h=endpoint.substr(start,end==std::string::npos?endpoint.size()-start:end-start); return pathStyle?h:bucket+"."+h; }
  std::string baseUrl() const { auto scheme=endpoint.substr(0,endpoint.find("://")+3); auto p=endpoint.find("//"); auto start=p==std::string::npos?0:p+2; auto end=endpoint.find('/',start); auto h=endpoint.substr(start,end==std::string::npos?endpoint.size()-start:end-start); return scheme+(pathStyle?h:bucket+"."+h)+(pathStyle?"/"+bucket:""); }
  bool request(const std::string& method,const std::string& key,const std::string& local,bool upload) const {
    if(!configured()) return false;
    auto now=std::chrono::system_clock::to_time_t(std::chrono::system_clock::now()); std::tm tm{};
#ifdef _WIN32
    gmtime_s(&tm,&now);
#else
    gmtime_r(&now,&tm);
#endif
    char shortDate[9], longDate[17]; std::strftime(shortDate,sizeof(shortDate),"%Y%m%d",&tm); std::strftime(longDate,sizeof(longDate),"%Y%m%dT%H%M%SZ",&tm);
    std::string uri="/"+key; if(pathStyle) uri="/"+bucket+uri; std::string payload="";
    if(upload){std::ifstream f(local,std::ios::binary);std::ostringstream b;b<<f.rdbuf();payload=b.str();}
    auto payloadHash=hex(sha(payload)); std::string canonical="host:"+host()+"\n"+"x-amz-content-sha256:"+payloadHash+"\n"+"x-amz-date:"+longDate+"\n\nhost;x-amz-content-sha256;x-amz-date\n"+payloadHash;
    std::string canonicalRequest=method+"\n"+uri+"\n\n"+canonical+"\n"+payloadHash; std::string scope=std::string(shortDate)+"/"+region+"/s3/aws4_request";
    std::string stringToSign=std::string("AWS4-HMAC-SHA256\n")+longDate+"\n"+scope+"\n"+hex(sha(canonicalRequest));
    std::vector<unsigned char> awsKey{'A','W','S','4'}; awsKey.insert(awsKey.end(),secretKey.begin(),secretKey.end()); auto kDate=hmac(awsKey,shortDate); auto kRegion=hmac(kDate,region); auto kService=hmac(kRegion,"s3"); auto kSigning=hmac(kService,"aws4_request"); auto signature=hex(hmac(kSigning,stringToSign));
    std::string auth="AWS4-HMAC-SHA256 Credential="+accessKey+"/"+scope+", SignedHeaders=host;x-amz-content-sha256;x-amz-date, Signature="+signature;
    std::string cmd=std::string(
#ifdef _WIN32
      "curl.exe"
#else
      "curl"
#endif
    )+" --silent --show-error --fail --max-time 15 --location --request "+method+" "+quote(baseUrl()+"/"+key)+" --header "+quote("Host: "+host())+" --header "+quote("x-amz-content-sha256: "+payloadHash)+" --header "+quote(std::string("x-amz-date: ")+longDate)+" --header "+quote("Authorization: "+auth);
    if(upload) cmd+=" --data-binary "+quote("@"+local); else cmd+=" --output "+quote(local);
    return std::system(cmd.c_str())==0;
  }
public:
  S3Store(){
    std::vector<std::string> fromFile;
    auto loadFile=[&](const std::string& path){std::ifstream f(path);std::string line;while(std::getline(f,line)){auto eq=line.find('=');if(eq!=std::string::npos)fromFile.push_back(line.substr(0,eq)+"\t"+line.substr(eq+1));}};
    loadFile(".env"); loadFile("../.env"); loadFile(envOr("LSM_DATA_DIR","data")+"/storage.env");
    auto fileOrEnv=[&](const std::string& key,const std::string& fallback){for(auto it=fromFile.rbegin();it!=fromFile.rend();++it)if(it->rfind(key+"\t",0)==0)return it->substr(key.size()+1);return envOr(key,fallback);};
    accessKey=fileOrEnv("AWS_ACCESS_KEY_ID",""); secretKey=fileOrEnv("AWS_SECRET_ACCESS_KEY",""); region=fileOrEnv("AWS_REGION","us-east-1"); bucket=fileOrEnv("S3_BUCKET",""); endpoint=fileOrEnv("S3_ENDPOINT",""); auto p=fileOrEnv("S3_FORCE_PATH_STYLE","true"); pathStyle=p=="true"||p=="1";
  }
  bool enabled() const { return configured(); }
  bool upload(const std::string& key,const std::string& file) const { return request("PUT",key,file,true); }
  bool download(const std::string& key,const std::string& file) const { std::string temp=file+".s3tmp"; bool ok=request("GET",key,temp,false); if(ok){std::error_code ec;std::filesystem::rename(temp,file,ec);if(ec){std::filesystem::remove(file,ec);std::filesystem::rename(temp,file,ec);}}else{std::error_code ec;std::filesystem::remove(temp,ec);} return ok; }
};
