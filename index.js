require('dotenv').config()
const { ethers } = require('ethers')
const express = require('express')
const app = express()
const cors = require('cors')

const corsOpts = {
  origin: ["https://holonym.id","http://localhost:3000", "http://localhost:3001", "http://localhost:3002", "http://localhost:8080", "http://localhost:8081"],
  optionsSuccessStatus: 200 // For legacy browser support
}

app.use(cors(corsOpts));
app.use(express.json());

const port = 3000;
// const { contracts } = require('./constants')
const hubAddress = "0x6A78dF871291627C5470F7a768745C3ff05741F2";
const hubABI = [
  "constructor(address)",
  "function addLeaf(address,uint8,bytes32,bytes32,tuple(tuple(uint256,uint256),tuple(uint256[2],uint256[2]),tuple(uint256,uint256)),uint256[3])",
  "function getLeaves() view returns (uint256[])",
  "function isFromIssuer(bytes,uint8,bytes32,bytes32,address) pure returns (bool)",
  "function mostRecentRoot() view returns (uint256)",
  "function mt() view returns (address)",
  "function oldLeafUsed(uint256) view returns (bool)",
  "function router() view returns (address)",
  "function verifyProof(string,tuple(tuple(uint256,uint256),tuple(uint256[2],uint256[2]),tuple(uint256,uint256)),uint256[]) view returns (bool)"
];


// // This can be an address or an ENS name
// const address = "0x764a06fDdcE6b8895b6E7F9ba2874711BF31edEa";
// const erc20_rw = new ethers.Contract(address, abi, signer);

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
const provider = new ethers.providers.AlchemyProvider("optimism-goerli", process.env.ALCHEMY_APIKEY);

const signer = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
const hub = new ethers.Contract(hubAddress, hubABI, signer);

const addLeaf = async (callParams) => {
//  console.log("callParams", callParams)
  const { issuer, v, r, s, zkp, zkpInputs } = callParams;
  const tx = await hub.addLeaf(
    issuer, 
    v, 
    r, 
    s, 
    Object.keys(zkp).map(k=>zkp[k]), // Convert struct to ethers format
    zkpInputs
  );
  await tx.wait();
  return true;
}
// provider.getBalance('0xC8834C1FcF0Df6623Fc8C8eD25064A4148D99388').then(b=>console.log(b))

app.get('/', (req, res) => {
  res.send('For this endpoint, POST your addLeaf parameters to /addLeaf and it will submit an addLeaf() transaction to Hub')
})

app.post('/addLeaf', async (req, res, next) => {
  // console.log(...args);
  try {
    await addLeaf(req.body.addLeafArgs);
  } catch(e) {
    res.status(400).send(e);
    return;
  }
  res.sendStatus(200);
})

app.listen(port, () => {

  console.log(`Example app listening on port ${port}`)
})
