const  { randomBytes } = require('crypto')
const { NonceManager } = require("@ethersproject/experimental");
const { ethers } = require('ethers')
const { nftAddresses, nftABIs } = require('../constants/misc');
const { callContractWithNonceManager } = require('../xccontract');

const optimismProvider = new ethers.providers.AlchemyProvider(
  "optimism",
  process.env.ALCHEMY_APIKEY
)
const nftWallet = new ethers.Wallet(process.env.MINTER_PRIVATE_KEY, optimismProvider);
const nftNonceManager = new NonceManager(nftWallet);

/**
 * @param {string} proofContractName Keyof contract-addresses.json object 
 * @param {string} recipient Address of recipient
 */
const mint = async (proofContractName, recipient) => {
  const nftAddr = nftAddresses[proofContractName];
  const nftABI = nftABIs[proofContractName];
  const nftContract = new ethers.Contract(nftAddr, nftABI, nftWallet);

  const tokenid = '0x' + randomBytes(32).toString('hex');

  const tx = await callContractWithNonceManager(
    nftContract,
    "safeMint",
    nftNonceManager,
    [recipient, tokenid]
  )

  return tx;
}

module.exports = {
  mint,
}