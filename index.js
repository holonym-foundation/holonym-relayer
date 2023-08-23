require('dotenv').config()
const fsPromises = require('node:fs/promises');
const { ethers } = require('./utils/get-ethers.js');
const express = require('express')
const app = express()
const cors = require('cors')
const axios = require('axios')
const Mutex = require('async-mutex').Mutex;
const tryAcquire = require('async-mutex').tryAcquire;
const withTimeout = require('async-mutex').withTimeout;
const { cloneDeep } = require('lodash')
const { CreateXChainContract, callContractWithNonceManager } = require('./xccontract')
const { IncrementalMerkleTree } = require("@zk-kit/incremental-merkle-tree");
const { poseidon } = require('circomlibjs-old');
const { backupTreePath, whitelistedIssuers } = require('./constants/misc');
const { initAddresses, getAddresses } = require("./utils/contract-addresses");
const { poseidonHashQuinary } = require('./utils/utils');
const { verifyProofCircom } = require('./utils/proofs');
const dynamodb = require('./dynamodb');

const corsOpts = {
  origin: ["https://holonym.io", "https://holonym.id","https://app.holonym.io","https://app.holonym.id", "https://staging.holonym.io", "https://metrics.holonym-internal.net", "http://localhost:3000", "http://localhost:3001", "http://localhost:3002", "http://localhost:8080", "http://localhost:8081"],
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

  const result = {...tx};
  if (tx?.wait) {
    const txReceipt = await tx.wait();
    result.blockNumber = txReceipt.blockNumber;
    result.transactionHash = txReceipt.transactionHash;
  }
  return result;
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
  console.log(`writeProof/${req.params.proofContractName}/${req.params.network} endpoint called with args `, JSON.stringify(req.body, null, 2));
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

const mutexWithTimeout = withTimeout(new Mutex(), 30 * 1000);
const tree = new IncrementalMerkleTree(poseidonHashQuinary, 14, "0", 5);
let treeV2HasBeenInitialized = false;

async function initTreeV2() {
  console.log("Initializing in-memory merkle tree for v2")
  console.time(`tree-initialization-v2`)
  // Initialize tree from DynamoDB backup
  try {
    await dynamodb.createLeavesTableIfNotExists();
    // level is level in tree (where 0 is level of leaves). 
    // 14 is tree depth. 5 is tree arity. 14^5 is number of leaves.
    for (let index = 0; index < 14 ** 5; index++) {
      if (process.env.NODE_ENV === 'development') await new Promise(r => setTimeout(r, 200));
      const data = await dynamodb.getLeafAtIndex(index);
      const leaf = data.Item?.LeafValue?.S;
      if (!leaf) break;
      tree.insert(leaf);
    }
  } catch (err) {
    console.error("initTreeV2: ", err);
  }
  treeV2HasBeenInitialized = true;
  console.log("Merkle tree in memory has been initialized for v2")
  console.timeEnd(`tree-initialization-v2`)
}

/**
 * Insert the leaf into the cached tree and the tree in the database, and update the on-chain roots.
 */
async function insertLeaf(newLeaf, signedLeaf) {
  if (!treeV2HasBeenInitialized) throw new Error("Tree has not been initialized yet");
  const txs = {};
  // The mutex here is crucial. Without it, there is no way to guarantee that node updates are
  // happening in the correct order.
  await mutexWithTimeout.runExclusive(async () => {
    // Add the leaf to the database. We update the database first so that if an error occurs during,
    // the request, neither the tree in the database nor the tree in memory is updated. All errors 
    // are bubbled to the caller of this function.
    await dynamodb.putLeaf(newLeaf, signedLeaf, tree.leaves.length);

    // Update local tree object
    tree.insert(newLeaf);

    // Update on-chain roots
    for (const network of Object.keys(xcontracts["Roots"].contracts)) {
      const root = tree.root;
      const contract = xcontracts["Roots"].contracts[network];
      const nonceManager = xcontracts["Roots"].nonceManagers[network];
      const tx = await callContractWithNonceManager(contract, "addRoot", nonceManager, [root]);
      if (tx?.wait) await tx.wait();
      txs[network] = tx;
    }
  });
  
  return txs;
}

app.post('/v2/addLeaf', async (req, res) => {
  if (process.env.HARDHAT_TESTING !== 'true') {
    console.log(new Date().toISOString());
    console.log('v2 addLeaf called with args ', JSON.stringify(req.body, null, 2));
  }
  try {
    const signedLeaf = req.body?.publicSignals?.[0];
    const newLeaf = req.body?.publicSignals?.[1];
    if (!signedLeaf || !newLeaf) throw new Error('Leaf not found in request body');

    // Check that the new leaf was not created with a signed leaf that has already been used
    const data = await dynamodb.getLeavesBySignedLeaf(signedLeaf)
    if (data?.Items.length > 0) throw new Error('Cannot create more than one new leaf from a single signed leaf');

    // Verify onAddLeaf proof
    const result = verifyProofCircom('onAddLeaf', req.body);
    if (!result) throw new Error('Invalid proof');

    // Update tree in memory and database, and update on-chain roots
    const txs = await insertLeaf(newLeaf, signedLeaf);

    res.status(200).json(txs);
  } catch(e) {
    console.error(e);
    res.status(400).send(e);
    return;
  }
})

app.get('/v2/getLeaves/', async (req, res) => {
  if (!treeV2HasBeenInitialized) {
    return res.status(500).json({ error: "Tree has not been initialized yet" });
  }
  res.send(tree.leaves);
})

app.get('/v2/getTree/', async (req, res) => {
  if (!treeV2HasBeenInitialized) {
    return res.status(500).json({ error: "Tree has not been initialized yet" });
  }
  res.status(200).json(tree);
})

app.get('/v2/leafExists/:leaf', async (req, res) => {
  if (!treeV2HasBeenInitialized) {
    return res.status(500).json({ error: "Tree has not been initialized yet" });
  }
  const leaf = req.params.leaf;
  const exists = tree.leaves.includes(leaf);
  res.status(200).json({ exists });
});

app.get('/v2/rootIsRecent/:root', async (req, res) => {
  if (!treeV2HasBeenInitialized) {
    return res.status(500).json({ error: "Tree has not been initialized yet" });
  }
  const root = req.params.root;
  
  let isRecent = false;
  for (const network of Object.keys(xcontracts["Roots"].contracts)) {
    const contract = xcontracts["Roots"].contracts[network];
    isRecent = await contract.rootIsRecent(root);
    if (isRecent) break;
  }

  res.status(200).json({ isRecent });
});

// --------------------------------------------------
// END v2 stuff
// --------------------------------------------------

// --------------------------------------------------
// START v3 stuff
// 
// v2 and v3 share the same Leaves table in DynamoDB but
// use different in-memory Merkle trees.
// --------------------------------------------------

const addLeafMutexV3 = withTimeout(new Mutex(), 30 * 1000);
// softFinalizedTreeV3 includes all the added leaves but its root is not in the 
// recentRoots mapping on chain
let softFinalizedTreeV3 = new IncrementalMerkleTree(poseidonHashQuinary, 14, "0", 5);
// finalizedTreeV3 does not include all the added leaves but its root is in the 
// recentRoots mapping on chain
let finalizedTreeV3 = new IncrementalMerkleTree(poseidonHashQuinary, 14, "0", 5);
// rootAtLastBackupV3 allows us to ensure that we only write the tree to the backup
// file if the tree as changed since the last backup. This in turn allows us to
// avoid unnecessary write costs.
let rootAtLastBackupV3 = '';
let treeV3HasBeenInitialized = false;

async function initTreeV3FromBackupFile() {
  try {
    const backupTreeStr = await fsPromises.readFile(`${backupTreePath}/tree.json`, 'utf8');
    const backupTree = JSON.parse(backupTreeStr);
    softFinalizedTreeV3._nodes = backupTree._nodes;
    softFinalizedTreeV3._root = backupTree._root;
    softFinalizedTreeV3._zeroes = backupTree._zeroes;
    finalizedTreeV3._nodes = backupTree._nodes;
    finalizedTreeV3._root = backupTree._root;
    finalizedTreeV3._zeroes = backupTree._zeroes;
    return true
  } catch (err) {
    console.error("initTreeV3 error:", err);
    return false
  }
}

async function initTreeV3FromDatabase() {
  // level is level in tree (where 0 is level of leaves). 
  // 14 is tree depth. 5 is tree arity. 14^5 is number of leaves.
  for (let index = 0; index < 14 ** 5; index++) {
    if (process.env.NODE_ENV === 'development') await new Promise(r => setTimeout(r, 200));
    const data = await dynamodb.getLeafAtIndex(index);
    const leaf = data.Item?.LeafValue?.S;
    if (!leaf) break;
    softFinalizedTreeV3.insert(leaf);
    finalizedTreeV3.insert(leaf);
  }
}

async function initTreeV3() {
  console.log("Initializing in-memory merkle tree for v3")
  console.time(`tree-initialization-v3`)
  // Initialize tree from DynamoDB backup
  try {
    await dynamodb.createLeavesTableIfNotExists();

    const initializedFromBackup = await initTreeV3FromBackupFile();
    if (!initializedFromBackup) {
      await initTreeV3FromDatabase()
    }
  } catch (err) {
    console.error("initTreeV3: ", err);
  }
  treeV3HasBeenInitialized = true;
  console.log("Merkle tree in memory has been initialized for v3")
  console.timeEnd(`tree-initialization-v3`)
}

/**
 * Insert the leaf into the cached tree and the tree in the database, and update the on-chain roots.
 */
async function insertLeafV3(newLeaf, signedLeaf) {
  if (!treeV3HasBeenInitialized) throw new Error("Tree has not been initialized yet");
  // The mutex here is crucial. Without it, there is no way to guarantee that node updates are
  // happening in the correct order.
  await addLeafMutexV3.runExclusive(async () => {
    // Add the leaf to the database. We update the database first so that if an error occurs during
    // the request, neither the tree in the database nor the tree in memory is updated. All errors 
    // are bubbled to the caller of this function.
    await dynamodb.putLeaf(newLeaf, signedLeaf, softFinalizedTreeV3.leaves.length);

    // Update local tree object
    softFinalizedTreeV3.insert(newLeaf);
  });
}

app.post('/v3/addLeaf', async (req, res) => {
  if (process.env.HARDHAT_TESTING !== 'true') {
    console.log(new Date().toISOString());
    console.log('v3 addLeaf called with args ', JSON.stringify(req.body, null, 2));
  }
  try {
    const signedLeaf = req.body?.publicSignals?.[0];
    const newLeaf = req.body?.publicSignals?.[1];
    if (!signedLeaf || !newLeaf) throw new Error('Leaf not found in request body');

    // Check that the new leaf was not created with a signed leaf that has already been used
    const data = await dynamodb.getLeavesBySignedLeaf(signedLeaf)
    if (data?.Items.length > 0) throw new Error('Cannot create more than one new leaf from a single signed leaf');

    // Verify onAddLeaf proof
    const result = verifyProofCircom('onAddLeaf', req.body);
    if (!result) throw new Error('Invalid proof');

    // Update tree in memory and database
    await insertLeafV3(newLeaf, signedLeaf);

    res.status(200).json({ success: true });
  } catch(e) {
    console.error(e);
    res.status(400).send(e);
  }
})

/**
 * /finalize-pending-tree sets the finalized tree to the soft finalized tree, writes the soft 
 * finalized tree to a file, and updates the on-chain root to reflect the new finalized tree.
 */
app.post('/v3/finalize-pending-tree', async (req, res) => {
  try {
    // Only allow requests with the admin API key
    if (req.headers['x-api-key'] !== process.env.ADMIN_API_KEY) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    if (!treeV3HasBeenInitialized) throw new Error("Tree has not been initialized yet");

    // TODO: CT: Question: Is it possible for softFinalizedTreeV3 to be in the process
    // of updating (due to a call to /v3/addLeaf) at the same time that this cloneDeep
    // call is executing? If so, we should use a mutex or something to prevent this case.
    const finalizedTree = cloneDeep(softFinalizedTreeV3)
    
    try {
      if (finalizedTree.root !== rootAtLastBackupV3) {
        await fsPromises.writeFile(
          `${backupTreePath}/tree.json`, 
          JSON.stringify(finalizedTree)
        );
        rootAtLastBackupV3 = finalizedTree.root;
      }
    } catch (err) {
      console.error(err)
      return res.status(500).json({ error: "Failed to write tree to file" });
    }

    const rootOnNetworkIsRecent = {};
    for (const network of Object.keys(xcontracts["Roots"].contracts)) {
      const contract = xcontracts["Roots"].contracts[network];
      isRecent = await contract.rootIsRecent(finalizedTree.root);
      rootOnNetworkIsRecent[network] = isRecent;
    }

    // Update on-chain roots if root is not recent
    const txs = {};
    const networksWithOutdatedRoots = Object.keys(rootOnNetworkIsRecent).filter(
      (network) => !rootOnNetworkIsRecent[network]
    )
    for (const network of networksWithOutdatedRoots) {
      const contract = xcontracts["Roots"].contracts[network];
      const nonceManager = xcontracts["Roots"].nonceManagers[network];
      const tx = await callContractWithNonceManager(contract, "addRoot", nonceManager, [finalizedTree.root]);
      if (tx?.wait) await tx.wait();
      txs[network] = tx;
    }

    finalizedTreeV3 = finalizedTree

    return res.status(200).json({ success: true, txs });
  } catch (err) {
    console.error(err);
    res.status(400).send(err)
  }
})

app.get('/v3/getLeaves/', async (req, res) => {
  if (!treeV3HasBeenInitialized) {
    return res.status(500).json({ error: "Tree has not been initialized yet" });
  }
  res.send(finalizedTreeV3.leaves);
})

app.get('/v3/getTree/', async (req, res) => {
  if (!treeV3HasBeenInitialized) {
    return res.status(500).json({ error: "Tree has not been initialized yet" });
  }
  res.status(200).json(finalizedTreeV3);
})

app.get('/v3/leafExists/:leaf', async (req, res) => {
  if (!treeV3HasBeenInitialized) {
    return res.status(500).json({ error: "Tree has not been initialized yet" });
  }
  const leaf = req.params.leaf;
  const exists = finalizedTreeV3.leaves.includes(leaf);
  res.status(200).json({ exists });
})

// --------------------------------------------------
// END v3 stuff
// --------------------------------------------------

app.listen(port, () => {
  console.log('Started server on port', port);
})

module.exports.appPromise = new Promise(
  function(resolve, reject) {
    const networks = ["optimism-goerli", "optimism"];
    if (process.env.NODE_ENV === 'development') networks.push('hardhat')
    init(networks)
    .then(initTreeV2)
    .then(initTreeV3)
    .then(resolve(app))
  }
); // For testing app with Chai
