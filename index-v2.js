/**
 * Contains functions unique to version 2 that will go in index.js once v2 is deployed to mainnet.
 */
const { GetItemCommand } = require("@aws-sdk/client-dynamodb");
const { IncrementalMerkleTree } = require("@zk-kit/incremental-merkle-tree");
const Mutex = require('async-mutex').Mutex;
const { verifyProofCircom } = require('./utils/proofs');
const { poseidonHashQuinary } = require('./utils/utils');
const { insert } = require('./tree-insert');
const { ddbClient, createTreeTableIfNotExists } = require('./dynamodb')

const mutex = new Mutex();
const tree = new IncrementalMerkleTree(poseidonHashQuinary, 14, "0", 5);
// Use custom insert function so that database is updated when local tree object is updated.
tree.insert = async (leaf, backupInDb = true) => {
  tree._root = await insert(leaf, tree.depth, tree.arity, tree._nodes, tree.zeroes, tree._hash, backupInDb);
}

async function initTreeV2() {
  console.log("Initializing in-memory merkle tree for v2")
  console.time(`tree-initialization-v2`)
  // Initialize tree from DynamoDB backup
  try {
    await createTreeTableIfNotExists();
    // level is level in tree (where 0 is level of leaves). 
    // 14 is tree depth. 5 is tree arity. 14^5 is number of leaves.
    for (let index = 0; index < 14 ** 5; index++) {
      const data = await ddbClient.send(new GetItemCommand({
        TableName: "MerkleTree",
        Key: {
          "NodeLocation": {
            S: `0-${index}`
          }
        }
      }));
      const leaf = data.Item?.NodeValue?.S;
      if (!leaf) break;
      // We set backupInDb to false to avoid re-inserting the leaf we just fetched
      tree.insert(leaf, false);
    }
  } catch (err) {
    console.error("initTree: ", err);
  }
  console.log("Merkle tree in memory has been initialized for v2")
  console.timeEnd(`tree-initialization-v2`)
}

/**
 * Insert the leaf into the cached tree and the tree in the database, and update the on-chain roots.
 */
async function insertLeaf(leaf) {
  const txs = {};
  for (const network of Object.keys(trees)) {
    try {
      // The mutex here is crucial. Database updates are eventually consistent, so we need to ensure that
      // all updates to the tree are done in the correct order. Every leaf insertion must be atomic.
      // Without the mutex, two insertions might happen at the same time, and the second insertion
      // might use outdated leaves.
      await tryAcquire(mutex).runExclusive(async () => {
        // Update local tree object and tree in database
        tree.insert(leaf);
        // TODO: Instead of using a local file as a backup, use the database. On process start, load into memory the tree from the database
        // Update on-chain root
        // TODO: Add Roots contract addresses to constants/contract-addresses.json
        const root = tree.root;
        const tx = await xcontracts["Roots"].contracts[network].addRoot(root);
        if (tx?.wait) await tx.wait();
        txs[network] = tx;
      });
    } catch (err) {
      console.log('Error updating tree on network', network);
      console.log(err);
    }
  }
  return txs;
}

async function addLeafEndpointV2(req, res) {
  console.log(new Date().toISOString());
  console.log('v2 addLeaf called with args ', JSON.stringify(req.body, null, 2));
  try {
    // Verify onAddLeaf proof
    const result = verifyProofCircom('onAddLeaf', req.body?.proof);
    if (!result) throw new Error('Invalid proof');

    // Update tree in memory and database, and update on-chain roots
    const newLeaf = req.body?.proof?.publicSignals?.[1];
    const txs = await insertLeaf(newLeaf);

    res.status(200).json(txs);
  } catch(e) {
    console.error(e);
    res.status(400).send(e);
    return;
  }
}

module.exports = {
  addLeafEndpointV2,
  initTreeV2,
}
