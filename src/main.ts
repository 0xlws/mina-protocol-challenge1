import { NumberTreeContract } from './NumberTreeContract.js';
import {
  OffChainStorage,
  MerkleWitness8,
} from 'experimental-zkapp-offchain-storage';
import fs from 'fs';

import {
  Mina,
  PrivateKey,
  AccountUpdate,
  Field,
  Bool,
  PublicKey,
  Provable,
  assert,
  Poseidon,
} from 'o1js';

import { makeAndSendTransaction, loopUntilAccountExists } from './utils.js';

import XMLHttpRequestTs from 'xmlhttprequest-ts';
const NodeXMLHttpRequest =
  XMLHttpRequestTs.XMLHttpRequest as any as typeof XMLHttpRequest;

function validateMessage(message: Field) {
  const flag1 = 1;
  const flag2 = 2;
  const flag3 = 4;
  const flag4 = 8;
  const flag5 = 16;
  const flag6 = 32;

  let i = parseInt(message.toBigInt().toString(2).slice(-6), 2);
  if ((i & flag1) == flag1) {
    if ((i & (flag2 + flag3 + flag4 + flag5 + flag6)) == 0) {
      return true;
    }
  }

  if ((i & flag2) == flag2) {
    if ((i & flag3) !== 0) {
      return true;
    }
  }

  if ((i & flag4) == flag4) {
    if ((i & (flag5 + flag6)) == 0) {
      return true;
    }
  }

  return false;
}

const useLocal = true;

// ----------------------------------------

const transactionFee = 100_000_000;
const treeHeight = 8;

let feePayerKey: PrivateKey;
let feePayerKey2: PrivateKey;
let zkappPrivateKey: PrivateKey;
let zkappPrivateKey2: PrivateKey;

if (useLocal) {
  const Local = Mina.LocalBlockchain();
  Mina.setActiveInstance(Local);

  feePayerKey = Local.testAccounts[0].privateKey;

  // console.log(feePayerKey.toPublicKey().toBase58());

  zkappPrivateKey = PrivateKey.random();
  zkappPrivateKey2 = PrivateKey.random();
} else {
  const Berkeley = Mina.Network(
    'https://api.minascan.io/node/berkeley/v1/graphql'
  );
  Mina.setActiveInstance(Berkeley);

  const deployAlias = process.argv[2];

  const deployerKeysFileContents = fs.readFileSync(
    'keys/' + deployAlias + '.json',
    'utf8'
  );

  const deployerPrivateKeyBase58 = JSON.parse(
    deployerKeysFileContents
  ).privateKey;

  feePayerKey = PrivateKey.fromBase58(deployerPrivateKeyBase58);
  feePayerKey2 = PrivateKey.fromBase58(deployerPrivateKeyBase58);

  zkappPrivateKey = feePayerKey;
  zkappPrivateKey2 = feePayerKey2;
}

const zkappPublicKey = zkappPrivateKey.toPublicKey();
const zkappPublicKey2 = zkappPrivateKey2.toPublicKey();

// ----------------------------------------

// setup the zkapp
const storageServerAddress = 'http://localhost:3001';

const storageServerAddress2 = 'http://localhost:3002';

const serverPublicKey = await OffChainStorage.getPublicKey(
  storageServerAddress,
  NodeXMLHttpRequest
);

const serverPublicKey2 = await OffChainStorage.getPublicKey(
  storageServerAddress2,
  NodeXMLHttpRequest
);

console.log('Compiling smart contract...');
await NumberTreeContract.compile();

console.log('Done compiling smart contract');
const zkapp = new NumberTreeContract(zkappPublicKey);

if (useLocal) {
  const transaction = await Mina.transaction(feePayerKey.toPublicKey(), () => {
    AccountUpdate.fundNewAccount(feePayerKey.toPublicKey());
    zkapp.deploy({ zkappKey: zkappPrivateKey });
    zkapp.initState(serverPublicKey, serverPublicKey2);
  });
  transaction.sign([zkappPrivateKey, feePayerKey]);
  await transaction.prove();
  await transaction.send();
} else {
  await loopUntilAccountExists({
    account: zkappPrivateKey.toPublicKey(),
    eachTimeNotExist: () =>
      console.log('waiting for zkApp account to be deployed...'),
    isZkAppAccount: true,
  });
}

// ----------------------------------------

let leafCount = 0n; // keep track of leaf count
let count = 0;

async function updateTree(eligibleAddress: Field) {
  // __________
  // ON CHAIN

  const treeRoot = await zkapp.storageTreeRoot.get();
  const messageTreeRoot = await zkapp.messageTreeRoot.get();

  Provable.log('main.ts updateTree root received: ', treeRoot);
  Provable.log(
    'main.ts updateTree messageTreeRoot received: ',
    messageTreeRoot
  );

  // __________
  // OFF CHAIN
  const idx2fields = await OffChainStorage.get(
    storageServerAddress,
    zkappPublicKey,
    treeHeight,
    treeRoot,
    NodeXMLHttpRequest
  );

  const idx2fields2 = await OffChainStorage.get(
    storageServerAddress2,
    zkappPublicKey2,
    treeHeight,
    messageTreeRoot,
    NodeXMLHttpRequest
  );

  count++;

  const tree = OffChainStorage.mapToTree(treeHeight, idx2fields);

  const leafWitness = new MerkleWitness8(tree.getWitness(BigInt(leafCount)));

  const tree2 = OffChainStorage.mapToTree(treeHeight, idx2fields2);

  const leafWitness2 = new MerkleWitness8(tree2.getWitness(BigInt(leafCount)));

  //   get the prior leaf
  const priorLeafIsEmpty = !idx2fields.has(leafCount); // make sure its empty

  let emptyMessage = Field(0n);

  //   update the leaf, and save it in the storage server
  idx2fields.set(leafCount, [eligibleAddress]);
  idx2fields2.set(leafCount, [emptyMessage]);

  const [storedNewStorageNumber, storedNewStorageSignature] =
    await OffChainStorage.requestStore(
      storageServerAddress,
      zkappPublicKey,
      treeHeight,
      idx2fields,
      NodeXMLHttpRequest
    );

  const [storedNewStorageNumber2, storedNewStorageSignature2] =
    await OffChainStorage.requestStore(
      storageServerAddress2,
      zkappPublicKey2,
      treeHeight,
      idx2fields2,
      NodeXMLHttpRequest
    );

  console.log(
    'changing leaf',
    leafCount,
    'from',
    leafCount.toString(),
    'to',
    eligibleAddress.toString()
  );

  console.log(
    'changing message leaf',
    leafCount,
    'to empty message',
    emptyMessage.toString()
  );

  // __________
  // ONCHAIN
  // update the smart contract

  const doUpdate = () => {
    zkapp.update(
      Bool(priorLeafIsEmpty),
      eligibleAddress,
      emptyMessage,
      leafWitness,
      leafWitness2,
      storedNewStorageNumber,
      storedNewStorageNumber2,
      storedNewStorageSignature,
      storedNewStorageSignature2
    );
  };

  if (useLocal) {
    const updateTransaction = await Mina.transaction(
      { sender: feePayerKey.toPublicKey(), fee: transactionFee },
      () => {
        doUpdate();
      }
    );
    updateTransaction.sign([zkappPrivateKey, feePayerKey]);
    await updateTransaction.prove();
    await updateTransaction.send();
  } else {
    await makeAndSendTransaction({
      feePayerPrivateKey: feePayerKey,
      zkAppPublicKey: zkappPublicKey,
      mutateZkApp: () => doUpdate(),
      transactionFee: transactionFee,
      getState: () => zkapp.storageTreeRoot.get(),
      statesEqual: (root1, root2) => root1.equals(root2).toBoolean(),
    });
  }
  // ____________________

  console.log('root updated to', zkapp.storageTreeRoot.get().toString());
  leafCount += 1n;
}

async function updateMessageTree(eligibleAddress: Field, message: Field) {
  console.log('// get the index of the address;');
  const Root = await zkapp.storageTreeRoot.get();
  // OFF CHAIN
  const idx: [Bool, bigint] | [Bool] = await OffChainStorage.getIdx(
    storageServerAddress,
    zkappPublicKey,
    treeHeight,
    Root,
    NodeXMLHttpRequest,
    eligibleAddress.toString()
  );
  idx[0].assertTrue();
  console.log('Found entry for address: ', eligibleAddress.toString());

  // check message validity
  console.log('// check message validity');
  const messageIsValid = validateMessage(message);

  if (messageIsValid == true) {
    console.log('message validity =', true, 'Continuing...');
  } else {
    console.log('message validity =', false, 'Message failed validation');
    return;
  }

  // ON CHAIN
  const treeRoot = await zkapp.storageTreeRoot.get();
  const messageTreeRoot = await zkapp.messageTreeRoot.get();

  Provable.log('main.ts root NumberTreeContract.ts: ', treeRoot);
  Provable.log(
    'main.ts messageTreeRoot NumberTreeContract.ts: ',
    messageTreeRoot
  );

  // __________
  // OFF CHAIN

  const idx2fields2 = await OffChainStorage.get(
    storageServerAddress2,
    zkappPublicKey2,
    treeHeight,
    messageTreeRoot,
    NodeXMLHttpRequest
  );

  console.log('Storing message to tree');
  const tree2 = OffChainStorage.mapToTree(treeHeight, idx2fields2);

  const leafWitness2 = new MerkleWitness8(tree2.getWitness(idx[1]!));

  //   get the prior leaf
  const priorLeafIsEmpty = !idx2fields2.has(idx[1]!);

  //   update the leaf, and save it in the storage server
  idx2fields2.set(idx[1]!, [message]);

  const [storedNewStorageNumber2, storedNewStorageSignature2] =
    await OffChainStorage.requestStore(
      storageServerAddress2,
      zkappPublicKey2,
      treeHeight,
      idx2fields2,
      NodeXMLHttpRequest
    );

  console.log('changing message leaf', idx[1]!, 'to', message.toString());

  // ONCHAIN
  // update the smart contract
  console.log('Updating smart-contract message root');

  const doUpdate = () => {
    zkapp.updateMessageRoot(
      Bool(priorLeafIsEmpty),
      message,
      Field(idx[1]!),
      leafWitness2,
      storedNewStorageNumber2,
      storedNewStorageSignature2
    );
  };

  if (useLocal) {
    const updateTransaction = await Mina.transaction(
      { sender: feePayerKey.toPublicKey(), fee: transactionFee },
      () => {
        doUpdate();
      }
    );
    updateTransaction.sign([zkappPrivateKey, feePayerKey]);
    await updateTransaction.prove();
    await updateTransaction.send();
  } else {
    await makeAndSendTransaction({
      feePayerPrivateKey: feePayerKey,
      zkAppPublicKey: zkappPublicKey,
      mutateZkApp: () => doUpdate(),
      transactionFee: transactionFee,
      getState: () => zkapp.storageTreeRoot.get(),
      statesEqual: (root1, root2) => root1.equals(root2).toBoolean(),
    });
  }
  // ____________________

  console.log('root updated to', zkapp.messageTreeRoot.get().toString());
}

console.log('\n##################################################\n');
console.log('STORE ELIGIBLE ADDRESSES\n');

let pubkey: PrivateKey;
let arr: PrivateKey[] = [];
let numberOfAddresses = 2; // change to 100 if u have time

for (let i = 1; i <= numberOfAddresses; i++) {
  pubkey = PrivateKey.random();
  await updateTree(pubkey.toPublicKey().x);
  arr.push(pubkey);
}

console.log('\n##################################################\n');
console.log('\n##################################################\n');
console.log('STORE VALID MESSAGE WITH ELIGBLE ADDRESS');

const eligibleAddress1: PrivateKey = arr[0];
Provable.log('feePayerKey:', feePayerKey.toPublicKey().toBase58());
Provable.log('eligbleAddress1:', eligibleAddress1.toPublicKey().toBase58());

console.log('- Update message tree');
await updateMessageTree(
  Field(eligibleAddress1.toPublicKey().x),
  Field(100000000001)
);
console.log();
await updateMessageTree(
  Field(arr[1].toPublicKey().x),
  Field(23424000000000013)
); // second eligible address
console.log('\n##################################################\n');
console.log();
console.log('- Done');
