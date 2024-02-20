import {
  MerkleWitness4,
  MerkleWitness8,
  MerkleWitness16,
  MerkleWitness24,
  MerkleWitness32,
  MerkleWitness64,
  MerkleWitness128,
  MerkleWitness256,
  Update,
  assertRootUpdateValid,
  assertRootUpdateValid2,
  get,
  getIdx,
  requestStore,
  getPublicKey,
  makeRequest,
  mapToTree,
} from './offChainStorage.js';

export type { Update };

const OffChainStorage = {
  assertRootUpdateValid,
  assertRootUpdateValid2,
  get,
  requestStore,
  getPublicKey,
  makeRequest,
  mapToTree,
  getIdx
};

export {
  OffChainStorage,
  MerkleWitness4,
  MerkleWitness8,
  MerkleWitness16,
  MerkleWitness24,
  MerkleWitness32,
  MerkleWitness64,
  MerkleWitness128,
  MerkleWitness256,
};
