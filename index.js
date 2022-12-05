require('dotenv').config()
const fsPromises = require('node:fs/promises');
const { ethers } = require('ethers')
const express = require('express')
const app = express()
const cors = require('cors')
const axios = require('axios')
const { IncrementalMerkleTree } = require("@zk-kit/incremental-merkle-tree");
const { poseidon } = require('circomlibjs-old');
const XChainContract = require('./xccontract')
const { backupTreeFileName } = require('./constants/misc');

const corsOpts = {
  origin: ["https://holonym.io", "https://holonym.id","https://app.holonym.io","https://app.holonym.id","http://localhost:3000", "http://localhost:3001", "http://localhost:3002", "http://localhost:8080", "http://localhost:8081"],
  optionsSuccessStatus: 200 // For legacy browser support
}

app.use(cors(corsOpts));
app.use(express.json());

const port = 3001;
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

const xchub = new XChainContract("Hub");
const goerliHub = xchub.contracts["optimism-goerli"]; // Keep the same testnet Hub for backwards compatability (at least for now)

const idServerUrl = process.env.NODE_ENV === "development" ? "http://localhost:3000" : "https://id-server.holonym.io";

let treeHasBeenInitialized = false;
const tree = new IncrementalMerkleTree(poseidonHashQuinary, 14, "0", 5);
let leafCountAtLastBackup = 0;

const addLeaf = async (callParams) => {
//  console.log("callParams", callParams)
  const { issuer, v, r, s, zkp, zkpInputs } = callParams;
  const result = await xchub.addLeaf(
    issuer, 
    v, 
    r, 
    s, 
    Object.keys(zkp).map(k=>zkp[k]), // Convert struct to ethers format
    zkpInputs
  );
  return result;
}
// provider.getBalance('0xC8834C1FcF0Df6623Fc8C8eD25064A4148D99388').then(b=>console.log(b))

async function backupTree(tree) {
  try {
    console.log('backing up merkle tree')
    await fsPromises.writeFile(backupTreeFileName, JSON.stringify(tree));
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
  console.log('args', req.body.addLeafArgs);
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


app.get('/getLeaves', async (req, res) => {
  const leaves = await goerliHub.getLeaves();
  res.send(leaves.map(leaf=>leaf.toString()));
})

app.get('/getTree', async (req, res) => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const timeout = new Date().getTime() + 60 * 1000;
  while (new Date().getTime() <= timeout && !treeHasBeenInitialized) {
    await sleep(50);
  }
  if (!treeHasBeenInitialized) {
    return res.status(500).json({ error: 'Merkle tree has not been initialized' });
  }

  // Update tree
  const leavesInContract = (await goerliHub.getLeaves()).map(leaf => leaf.toString());
  const newLeaves = leavesInContract.filter(leaf => !tree.leaves.includes(leaf));
  for (const leaf of newLeaves) {
    tree.insert(leaf);
  }

  if (tree.leaves.length - leafCountAtLastBackup >= 1) {
    await backupTree(tree);
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

async function initializeTree() {
  console.log('Initializing in-memory merkle tree')
  console.time('tree-initialization')
  // Initialize tree from backup. This step ensures that we can respond to getTree 
  // requests immediately after this Node.js process restarts. It might take hours to 
  // reconstruct the tree from leaves in the smart contract.
  try {
    const backupTreeStr = await fsPromises.readFile(backupTreeFileName, 'utf8');
    const backupTree = JSON.parse(backupTreeStr);
    tree._nodes = backupTree._nodes;
    tree._root = backupTree._root;
    tree._zeroes = backupTree._zeroes;
    leafCountAtLastBackup = tree.leaves.length;
  } catch (err) {
    console.log(err);
  }

  // Initialize tree from contract
  const leaves = (await goerliHub.getLeaves()).map(leaf => leaf.toString());
  for (const leaf of leaves) {
    tree.insert(leaf);
  }
  treeHasBeenInitialized = true;
  console.log('Merkle tree in memory has been initialized')
  console.timeEnd('tree-initialization')

  await backupTree(tree);
}

// TODO: initialize tree using S3 backup (or local file)
// pseudocode: 
// let treeBackup = fs.readFile(backup); 
// for property in treeBackup: tree[property] = treeBackup[property]

initializeTree()

app.listen(port, () => {})
