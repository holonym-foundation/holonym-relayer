require('dotenv').config()
const fsPromises = require('node:fs/promises');
const { ethers } = require('ethers')
const express = require('express')
const app = express()
const cors = require('cors')
const axios = require('axios')
const CreateXChainContract = require('./xccontract')
const contractAddresses = require('./constants/contract-addresses.json')
const { IncrementalMerkleTree } = require("@zk-kit/incremental-merkle-tree");
const { poseidon } = require('circomlibjs-old');
const { backupTreePath } = require('./constants/misc');

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

const idServerUrl = process.env.NODE_ENV === "development" ? "http://127.0.0.1:3000" : "https://id-server.holonym.io";

// let treeHasBeenInitialized = false;
const trees = {} //new IncrementalMerkleTree(poseidonHashQuinary, 14, "0", 5);
// let leafCountAtLastBackup = 0;


const init = async (networkNames) => {
  for (const contractName of Object.keys(contractAddresses)) {
    xcontracts[contractName] = await CreateXChainContract("Hub");
  }
  for (const networkName of networkNames) {
    await initTree(networkName);
  }
  
};


const addLeaf = async (callParams) => {
//  console.log("callParams", callParams)
  const { issuer, v, r, s, zkp, zkpInputs } = callParams;
  const result = await xcontracts["Hub"].addLeaf(
    issuer, 
    v, 
    r, 
    s, 
    Object.keys(zkp).map(k=>zkp[k]), // Convert struct to ethers format
    zkpInputs
  );
  return result;
}

const writeProof = async (proofContractName, networkName, callParams) => {
  
  const { zkp, zkpInputs } = callParams;
  const result = await xcontracts[proofContractName].contracts[networkName].addLeaf(
    Object.keys(zkp).map(k=>zkp[k]), // Convert struct to ethers format
    zkpInputs
  );
  return result;
}


async function backupTree(tree, networkName) {
  try {
    console.log("backing up merkle tree")
    await fsPromises.writeFile(`${backupTreePath}/${networkName}.json`, JSON.stringify(tree));
    leafCountAtLastBackup = tree.leaves.length;
  } catch (err) {
    console.log(err)
  }
}

/**
 * @param {object} credsToStore should contain three params each of type string 
 */
 async function postUserCredentials(credsToStore) {
  const { sigDigest, encryptedCredentials, encryptedSymmetricKey } = credsToStore
  const resp = await axios.post(`${idServerUrl}/credentials`, {
    apiKey: process.env.ID_SERVER_API_KEY,
    sigDigest: sigDigest,
    encryptedCredentials: encryptedCredentials,
    encryptedSymmetricKey: encryptedSymmetricKey
  })
  return resp.data
}

app.post('/addLeaf', async (req, res, next) => {
  console.log('addLeaf called with args ', JSON.stringify(req.body.addLeafArgs));
  try {
    const txReceipt = await addLeaf(req.body.addLeafArgs);
    // if addLeaf doesn't throw, we assume tx was successful
    await postUserCredentials(req.body.credsToStore)
    res.status(200).json(txReceipt);
  } catch(e) {
    console.error(e);
    res.status(400).send(e);
    return;
  }
})

app.get('/writeProof/:network/:chain', async (req, res) => {
  console.log('writeProof called with args ', req.body.writeProofArgs);
  try {
    const txReceipt = await writeProof(req.params.proofContractName, req.params.network, req.body.addLeafArgs);
    res.status(200).json(txReceipt);
  } catch(e) {
    console.error(e);
    res.status(400).send(e);
    return;
  }
})



app.get('/getLeaves/:network', async (req, res) => {
  const leaves = await xcontracts["Hub"].contracts[req.params.network].getLeaves();
  res.send(leaves.map(leaf=>leaf.toString()));
})

app.get('/getTree/:network', async (req, res) => {
  // const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  // const timeout = new Date().getTime() + 60 * 1000;
  // while (new Date().getTime() <= timeout && !treeHasBeenInitialized) {
  //   await sleep(50);
  // }
  if (!(req.params.network in trees)) {
    return res.status(500).json({ error: "Merkle tree has not been initialized" });
  }
  let tree = trees[req.params.network];
  console.log(xcontracts["Hub"])
  console.log(xcontracts["Hub"].contracts[req.params.network])
  const currentLeaves = tree._nodes[0];
  const newLeaves = (
    await xcontracts["Hub"].contracts[req.params.network]
    .getLeavesFrom(currentLeaves.length)
  )
  .map(leaf => leaf.toString());
  for (const leaf of newLeaves) {
    tree.insert(leaf);
  }

  if (currentLeaves) {
    await backupTree(tree, req.params.network);
  }
  return res.status(200).json(tree);
})

app.get('/', (req, res) => {
  res.send('For this endpoint, POST your addLeaf parameters to /addLeaf and it will submit an addLeaf() transaction to Hub')
})


function poseidonHashQuinary(input) {
  if (input.length !== 5 || !Array.isArray(input)) {
    throw new Error("input must be an array of length 5");
  }
  return poseidon(input.map((x) => ethers.BigNumber.from(x).toString())).toString();
}

async function initTree(networkName) {
  let tree = new IncrementalMerkleTree(poseidonHashQuinary, 14, "0", 5);
  if(networkName === "hardhat") { console.error("WARNING: not initializing hardhat tree from backup, as hardhat network's state is not persistent and this would load a deleted tree"); trees["hardhat"] = tree; return }
  if(!(networkName in xcontracts["Hub"].contracts)) return; // If it doesn't support the network, abort and return an empty Merkle Tree

    console.log("Initializing in-memory merkle tree")
    console.time("tree-initialization")

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
  console.log("Merkle tree in memory has been initialized")
  console.timeEnd("tree-initialization")
  trees[networkName] = tree;
  await backupTree(tree);
}

app.listen(port, () => {})

module.exports.appPromise = new Promise(
  function(resolve, reject){
    init(["hardhat", "optimism-goerli"]).then(resolve(app))
  }
); // For testing app with Chai
