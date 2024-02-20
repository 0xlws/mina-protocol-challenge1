import {
  SmartContract,
  Field,
  MerkleTree,
  state,
  State,
  method,
  DeployArgs,
  Signature,
  PublicKey,
  Permissions,
  Bool,
  Provable,
  Gadgets,
  Poseidon,
} from 'o1js';

import {
  OffChainStorage,
  MerkleWitness8,
} from 'experimental-zkapp-offchain-storage';

export class NumberTreeContract extends SmartContract {
  @state(PublicKey) storageServerPublicKey = State<PublicKey>();
  @state(PublicKey) messageServerPublicKey = State<PublicKey>();
  @state(Field) storageNumber = State<Field>();
  @state(Field) messageNumber = State<Field>();
  @state(Field) storageTreeRoot = State<Field>();
  @state(Field) messageTreeRoot = State<Field>();

  deploy(args: DeployArgs) {
    super.deploy(args);
    this.account.permissions.set({
      ...Permissions.default(),
      editState: Permissions.proofOrSignature(),
    });
  }

  @method initState(
    storageServerPublicKey: PublicKey,
    messageServerPublicKey: PublicKey
  ) {
    this.storageServerPublicKey.set(storageServerPublicKey);
    this.messageServerPublicKey.set(messageServerPublicKey);
    this.storageNumber.set(Field(0));
    this.messageNumber.set(Field(0));

    const emptyTreeRoot = new MerkleTree(8).getRoot();
    this.storageTreeRoot.set(emptyTreeRoot);

    const emptyTreeRoot2 = new MerkleTree(8).getRoot();
    this.messageTreeRoot.set(emptyTreeRoot2);

  }

  @method update(
    leafIsEmpty: Bool,
    eligibleAddress: Field,
    message: Field,
    path: MerkleWitness8,
    path2: MerkleWitness8,
    storedNewRootNumber: Field,
    storedNewRootNumber2: Field,
    storedNewRootSignature: Signature,
    storedNewRootSignature2: Signature
  ) {

    let storedRoot = this.storageTreeRoot.get();
    let messageRoot = this.messageTreeRoot.get();
    // console.log()
    // Provable.log(
    //   'NumberTreeContract.ts root:',
    //   storedRoot,
    //   'messageRoot:',
    //   messageRoot
    // );
    // console.log()
    this.storageTreeRoot.assertEquals(storedRoot);
    this.messageTreeRoot.assertEquals(messageRoot);

    let leafCount = this.storageNumber.get();
    this.storageNumber.assertEquals(leafCount);
    
    // max 100 addresses
    leafCount.assertLessThanOrEqual(Field(99n), 'Tree is full!')

    let messageNumber = this.messageNumber.get();
    this.messageNumber.assertEquals(messageNumber);

    let storageServerPublicKey = this.storageServerPublicKey.get();
    this.storageServerPublicKey.assertEquals(storageServerPublicKey);

    let messageServerPublicKey = this.messageServerPublicKey.get();
    this.messageServerPublicKey.assertEquals(messageServerPublicKey);

    const updates = [
      {
        eligibleAddress,
        leafIsEmpty,
        newLeafIsEmpty: Bool(false),
        leafWitness: path,
      },
    ];
    const updates2 = [
      {
        message,
        leafIsEmpty,
        newLeafIsEmpty: Bool(false),
        leafWitness: path2,
      },
    ];

    const storedNewRoot = OffChainStorage.assertRootUpdateValid(
      storageServerPublicKey,
      leafCount,
      storedRoot,
      updates,
      storedNewRootNumber,
      storedNewRootSignature
    );
    const storedNewRoot2 = OffChainStorage.assertRootUpdateValid2(
      messageServerPublicKey,
      leafCount,
      messageRoot,
      updates2,
      storedNewRootNumber2,
      storedNewRootSignature2
    );

    this.storageTreeRoot.set(storedNewRoot);
    // Provable.log('smart-contract root set to: ', storedNewRoot);
    // console.log()
    this.messageTreeRoot.set(storedNewRoot2);
    // Provable.log('smart-contract messageRoot set to: ', storedNewRoot2);
    // console.log()
    this.storageNumber.set(storedNewRootNumber);
    this.messageNumber.set(storedNewRootNumber2);
  }

  @method updateMessageRoot(
    leafIsEmpty: Bool,
    message: Field,
    index: Field,
    path2: MerkleWitness8,
    storedNewRootNumber2: Field,
    storedNewRootSignature2: Signature
  ) {
    const messageRoot = this.messageTreeRoot.get();
    // Provable.log('smart-contract updating messageRoot', messageRoot);
    this.messageTreeRoot.assertEquals(messageRoot);

    let messageNumber = this.messageNumber.get();
    this.messageNumber.assertEquals(messageNumber);

    let messageServerPublicKey = this.messageServerPublicKey.get();
    this.messageServerPublicKey.assertEquals(messageServerPublicKey);

    const updates2 = [
      {
        message,
        leafIsEmpty,
        newLeafIsEmpty: Bool(false),
        leafWitness: path2,
      },
    ];

    const storedNewRoot2 = OffChainStorage.assertRootUpdateValid2(
      messageServerPublicKey,
      index,
      messageRoot,
      updates2,
      storedNewRootNumber2,
      storedNewRootSignature2
    );

    this.messageTreeRoot.set(storedNewRoot2);
    // Provable.log('smart-contract messageRoot set to: ', storedNewRoot2);

    this.messageNumber.set(storedNewRootNumber2);
  }

  @method checkCommitment(address: Field, path: MerkleWitness8) {
    // console.log('checking commitment on-chain...');
    // assert treeroot is correct on chain
    const treeRoot = this.storageTreeRoot.get();
    this.storageTreeRoot.requireEquals(treeRoot);

    // we check that the account is within the committed Merkle Tree
    path
      .calculateRoot(Poseidon.hash([address]))
      .assertEquals(this.storageTreeRoot.get(), 'ADDRESS NOT ELIGBLE');

    // console.log('Address eligble and messageTreeRoot is correct');
  }

  @method checkSender() {
    Provable.log(this.sender);
  }
}
