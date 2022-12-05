require('dotenv').config()
const { ethers } = require('ethers')
const express = require('express')
const app = express()
const cors = require('cors')
const axios = require('axios')
const CreateXChainContract = require('./xccontract')

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
let goerliHub; // Keep the same testnet Hub for backwards compatability (at least for now)
const init = async () => {
  for (const contractName of Object.keys(contractAddresses)) {
    xcontracts[contractName] = await CreateXChainContract("Hub");
  }
  // xcontracts["Hub"] = await CreateXChainContract("Hub");
  goerliHub = xcontracts["Hub"].contracts["optimism-goerli"];

};

const idServerUrl = process.env.NODE_ENV === "development" ? "http://localhost:3000" : "https://id-server.holonym.io";

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

const writeProof = async (proofContractName, callParams) => {
  
  const { zkp, zkpInputs } = callParams;
  const result = await xcontracts[proofContractName].addLeaf(
    Object.keys(zkp).map(k=>zkp[k]), // Convert struct to ethers format
    zkpInputs
  );
  return result;
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
  console.log('addLeaf called with args ', req.body.addLeafArgs);
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

app.get('/writeProof/:proofContractName', async (req, res) => {
  console.log('writeProof called with args ', req.body.writeProofArgs);
  try {
    const txReceipt = await writeProof(req.body.addLeafArgs);

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

app.get('/getLeaves/:network', async (req, res) => {
  const leaves = await xcontracts["Hub"].contracts[req.params.network].getLeaves();
  res.send(leaves.map(leaf=>leaf.toString()));
})

app.get('/', (req, res) => {
  res.send('For this endpoint, POST your addLeaf parameters to /addLeaf and it will submit an addLeaf() transaction to Hub')
})

app.listen(port, () => {})

module.exports.appPromise = new Promise(
  function(resolve, reject){
    init().then(resolve(app))
  }
); // For testing app with Chai
