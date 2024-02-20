#! /bin/bash

# Assign the main directory path to a variable, assume current directory as base
MAIN_DIR=$(pwd)
 
npm install && \
cd "$MAIN_DIR/experimental-zkapp-offchain-storage" && \
npm install && \
npm run build &&\
cd "$MAIN_DIR" && \
npx link ./experimental-zkapp-offchain-storage && \
npm run build 
