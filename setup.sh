#! /bin/bash

# Assign the main directory path to a variable, assume current directory as base
MAIN_DIR=$(pwd)

# Navigate to the target directory and perform operations
cd "$MAIN_DIR/docs2/examples/zkapps/06-offchain-storage/experimental-zkapp-offchain-storage" && \
npm install && \
npm run build && \
npm link

# Go back to the main directory and continue with other operations
cd "$MAIN_DIR" && \
npm install && \
npm link experimental-zkapp-offchain-storage && \
npm run build