const { ethers } = require('ethers')
const express = require('express')
const app = express()
const port = 3000
require('dotenv').config()
// const { contracts } = require('./constants')
const abi = [
    // Read-Only Functions
    "function balanceOf(address owner) view returns (uint256)",
    "function decimals() view returns (uint8)",
    "function symbol() view returns (string)",

    // Authenticated Functions
    "function transfer(address to, uint amount) returns (bool)",

    // Events
    "event Transfer(address indexed from, address indexed to, uint amount)"
];

// This can be an address or an ENS name
const address = "0x764a06fDdcE6b8895b6E7F9ba2874711BF31edEa";
const erc20_rw = new ethers.Contract(address, abi, signer);

const provider = ethers.getDefaultProvider(network, {
    
    // etherscan: YOUR_ETHERSCAN_API_KEY,
    // infura: YOUR_INFURA_PROJECT_ID,
    // // Or if using a project secret:
    // // infura: {
    // //   projectId: YOUR_INFURA_PROJECT_ID,
    // //   projectSecret: YOUR_INFURA_PROJECT_SECRET,
    // // },
    // alchemy: YOUR_ALCHEMY_API_KEY,
    pocket: {
      applicationId: '632c778cd7c911003ac58b7b',
      applicationSecretKey: process.env.POCKET_RELAYER_SECRET
    },
    // ankr: YOUR_ANKR_API_KEY
});

app.get('/', (req, res) => {
  res.send('Hello World!')
})

app.listen(port, () => {

  console.log(`Example app listening on port ${port}`)
})