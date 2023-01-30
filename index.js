require('dotenv').config()
const fsPromises = require('node:fs/promises');
const { GetItemCommand } = require("@aws-sdk/client-dynamodb");
const { ethers } = require('./utils/get-ethers.js');
const express = require('express')
const app = express()
const cors = require('cors')
const axios = require('axios')
const Mutex = require('async-mutex').Mutex;
const tryAcquire = require('async-mutex').tryAcquire;
const { CreateXChainContract, callContractWithNonceManager } = require('./xccontract')
const { IncrementalMerkleTree } = require("@zk-kit/incremental-merkle-tree");
const { poseidon } = require('circomlibjs-old');
const { backupTreePath, whitelistedIssuers } = require('./constants/misc');
const { initAddresses, getAddresses } = require("./utils/contract-addresses");
const { poseidonHashQuinary } = require('./utils/utils');
const { verifyProofCircom } = require('./utils/proofs');
const { insert } = require('./tree-insert');
const { MerkleTreeTableName, ddbClient, createTreeTableIfNotExists } = require('./dynamodb')

const corsOpts = {
  origin: ["https://holonym.io", "https://holonym.id","https://app.holonym.io","https://app.holonym.id","http://localhost:3000", "http://localhost:3001", "http://localhost:3002", "http://localhost:8080", "http://localhost:8081"],
  optionsSuccessStatus: 200 // For legacy browser support
}

app.use(cors(corsOpts));
app.use(express.json());

const port = process.env.PORT || 3000;
// const { contracts } = require('./constants')


// const provider = ethers.getDefaultProvider(process.env.ALCHEMY_RPCURL, {
    
//     // etherscan: YOUR_ETHERSCAN_API_KEY,
//     // infura: YOUR_INFURA_PROJECT_ID,
//     // // Or if using a project secret:
//     // // infura: {
//     // //   projectId: YOUR_INFURA_PROJECT_ID,
//     // //   projectSecret: YOUR_INFURA_PROJECT_SECRET,
//     // // },
//     alchemy: process.env.ALCHEMY_APIKEY,
//     // pocket: {
//     //   applicationId: process.env.POCKET_RELAYER_APPID,
//     //   applicationSecretKey: process.env.POCKET_RELAYER_SECRET
//     // },
//     // ankr: YOUR_ANKR_API_KEY
// });

let xcontracts = {}


// mutexes are used to prevent race conditions from occuring during tree updates
const mutexes = {};

// let treeHasBeenInitialized = false;
const trees = {} //new IncrementalMerkleTree(poseidonHashQuinary, 14, "0", 5);
// let leafCountAtLastBackup = 0;
let addresses

const init = async (networkNames) => {
  await initAddresses();
  addresses = getAddresses();
  for (const contractName of Object.keys(addresses)) {
    xcontracts[contractName] = await CreateXChainContract(contractName);
  }
  for (const networkName of networkNames) {
    await initTree(networkName);
    mutexes[networkName] = new Mutex();
  }
  
};


const addLeaf = async (args) => {
  const { issuer, signature, proof } = args; 
  const { v, r, s } = ethers.utils.splitSignature(signature);
  const txs = await xcontracts["Hub"].addLeaf(
    issuer, 
    v, 
    r, 
    s, 
    Object.keys(proof.proof).map(k=>proof.proof[k]), // Convert proof object to ethers format to be serialized into a Solidity struct
    proof.inputs
  );
  for (const networkName of Object.keys(txs)) {
    if (txs[networkName]?.wait) txs[networkName] = await txs[networkName].wait();
  }
  return txs;
}

const writeProof = async (proofContractName, networkName, callParams) => {
  
  const { proof, inputs } = callParams;
  // const tx = await xcontracts[proofContractName].contracts[networkName].prove(
  //   Object.keys(proof).map(k=>proof[k]), // Convert struct to ethers format
  //   inputs
  // );
  const contract = xcontracts[proofContractName].contracts[networkName];
  const nonceManager = xcontracts[proofContractName].nonceManagers[networkName];
  const args = [
      Object.keys(proof).map(k=>proof[k]), // Convert struct to ethers format
      inputs
  ]
  const tx = await callContractWithNonceManager(contract, "prove", nonceManager, args);

  if (tx?.wait) return await tx.wait();
}


async function backupTree(tree, networkName) {
  try {
    await fsPromises.writeFile(`${backupTreePath}/${networkName}.json`, JSON.stringify(tree));
    leafCountAtLastBackup = tree.leaves.length;
  } catch (err) {
    console.error(err)
  }
}

async function updateTree(network) {
  try {
    await tryAcquire(mutexes[network]).runExclusive(async () => {
      const contract = xcontracts["Hub"].contracts[network];
      const index = trees[network].leaves.length;
      const newLeaves = (await contract.getLeavesFrom(index)).map(leaf => leaf.toString());
      for (const leaf of newLeaves) {
        trees[network].insert(leaf);
      }
      if (trees[network].leaves) {
        await backupTree(trees[network], network);
      }
    });
  } catch (err) {
    console.log('Error updating tree on network', network);
    console.log(err);
  }
}

app.post('/addLeaf', async (req, res, next) => {
  console.log(new Date().toISOString());
  console.log('addLeaf called with args ', JSON.stringify(req.body, null, 2));
  try {
    // Ensure leaf was signed by whitelisted issuer
    if (process.env.HARDHAT_TESTING !== 'true') {
      const { issuer, signature, proof } = req.body;
      if (!whitelistedIssuers.includes(issuer.toLowerCase())) {
        return res.status(400).send("Issuer is not whitelisted");
      }
      const msg = ethers.utils.arrayify(proof.inputs[0]); // leaf
      const leafSigner = ethers.utils.verifyMessage(msg, signature.compact)
      if (leafSigner.toLowerCase() !== issuer.toLowerCase()) {
        return res.status(400).send("Signature is not from issuer");
      }
    }

    const txReceipts = await addLeaf(req.body);
    // if addLeaf doesn't throw, we assume tx was successful
    for (const networkName of Object.keys(trees)) {
      await updateTree(networkName);
    }

    res.status(200).json(txReceipts);
  } catch(e) {
    console.error(e);
    res.status(400).send(e);
    return;
  }
})

// proofContractName: "IsUSResident" or "SybilResistance"
// network: "optimism-goerli", "hardhat", ...
// writeProofArgs
app.post('/writeProof/:proofContractName/:network', async (req, res) => {
  console.log(new Date().toISOString());
  console.log('writeProof called with args ', req.body.writeProofArgs);
  try {
    const txReceipt = await writeProof(req.params.proofContractName, req.params.network, req.body.writeProofArgs);
    res.status(200).json(txReceipt);
  } catch(e) {
    console.error(e);
    res.status(400).send(e);
    return;
  }
})



app.get('/getLeaves/:network', async (req, res) => {
  const contract = xcontracts["Hub"]?.contracts[req.params.network];
  if (!contract) return res.send([]);
  const leaves = await contract.getLeaves();
  res.send(leaves.map(leaf=>leaf.toString()));
})

app.get('/getTree/:network', async (req, res) => {
  if (!(req.params.network in trees)) {
    return res.status(500).json({ error: "Merkle tree has not been initialized" });
  }

  // Trigger tree update. Tree is updated asynchronously so that request can be served immediately
  updateTree(req.params.network);

  // Wait 400ms for tree updates (we aren't awaiting udpateTree because of the exclusive mutex; we don't want to wait forever if the queue for updating the tree is long)
  await new Promise(resolve => setTimeout(resolve, 400));
  let tree = trees[req.params.network];

  return res.status(200).json(tree);
})

app.get('/', (req, res) => {
  res.send('For this endpoint, POST your addLeaf parameters to /addLeaf and it will submit an addLeaf() transaction to Hub')
})

async function initTree(networkName) {
  let tree = new IncrementalMerkleTree(poseidonHashQuinary, 14, "0", 5);
  if(networkName === "hardhat") { console.error("WARNING: not initializing hardhat tree from backup, as hardhat network's state is not persistent and this would load a deleted tree"); trees["hardhat"] = tree; return }
  if(!(networkName in xcontracts["Hub"].contracts)) return; // If it doesn't support the network, abort and return an empty Merkle Tree

    console.log("Initializing in-memory merkle tree for", networkName)
    console.time(`tree-initialization-${networkName}`)

  // Initialize tree from backup. This step ensures that we can respond to getTree 
  // requests immediately after this Node.js process restarts. It might take hours to 
  // reconstruct the tree from leaves in the smart contract.
  try {
    const backupTreeStr = await fsPromises.readFile(`${backupTreePath}/${networkName}.json`, 'utf8');
    const backupTree = JSON.parse(backupTreeStr);
    tree._nodes = backupTree._nodes;
    tree._root = backupTree._root;
    tree._zeroes = backupTree._zeroes;
  } catch (err) {
    console.error("initTree: ", err);
  }
  // Initialize tree from contract
  const numLeaves = tree._nodes[0].length;
  const newLeaves = (await xcontracts["Hub"].contracts[networkName].getLeavesFrom(numLeaves)).map(leaf => leaf.toString());
  for (const leaf of newLeaves) {
    tree.insert(leaf);
  }

  // treeHasBeenInitialized = true;
  console.log("Merkle tree in memory has been initialized for", networkName)
  console.timeEnd(`tree-initialization-${networkName}`)
  trees[networkName] = tree;
  await backupTree(tree, networkName);
}

// --------------------------------------------------
// START v2 stuff
// --------------------------------------------------

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
        TableName: MerkleTreeTableName,
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
  for (const network of Object.keys(xcontracts["Roots"].contracts)) {
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

// v2
app.post('/v2/addLeaf', async (req, res) => {
  console.log(new Date().toISOString());
  console.log('v2 addLeaf called with args ', JSON.stringify(req.body, null, 2));
  try {
    // Verify onAddLeaf proof
    const result = verifyProofCircom('onAddLeaf', req.body);
    if (!result) throw new Error('Invalid proof');

    // Update tree in memory and database, and update on-chain roots
    const newLeaf = req.body?.publicSignals?.[1];
    if (!newLeaf) throw new Error('Leaf not found');
    const txs = await insertLeaf(newLeaf);

    res.status(200).json(txs);
  } catch(e) {
    console.error(e);
    res.status(400).send(e);
    return;
  }
})

app.get('/leafExists/:leaf', async (req, res) => {
  const leaf = req.params.leaf;
  const exists = tree._nodes[0].includes(leaf);
  res.status(200).json({ exists });
});

// --------------------------------------------------
// END v2 stuff
// --------------------------------------------------

app.listen(port, () => {})

module.exports.appPromise = new Promise(
  function(resolve, reject) {
    const networks = ["optimism-goerli", "optimism"];
    if (process.env.NODE_ENV === 'development') networks.push('hardhat')
    init(networks)
    .then(initTreeV2)
    .then(resolve(app))
  }
); // For testing app with Chai
