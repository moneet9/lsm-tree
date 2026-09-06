#include "engine.hpp"
#include "http_server.hpp"
#include <cstdlib>
#include <iostream>
int main(){int port=8080;if(const char* value=std::getenv("LSM_PORT"))port=std::atoi(value);Engine engine(std::getenv("LSM_DATA_DIR")?std::getenv("LSM_DATA_DIR"):"data");std::cout<<"LSM server listening on http://127.0.0.1:"<<port<<"\n";runHttpServer(engine,port);}
