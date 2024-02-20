#! /bin/bash

cd docs2/examples/zkapps/06-offchain-storage/experimental-zkapp-offchain-storage && npm install && npm run build && npm link;
cd ../../../../.. && npm install && npm link experimental-zkapp-offchain-storage && npm run build;
