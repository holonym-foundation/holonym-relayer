const { NonceManager } = require("@ethersproject/experimental");
require("dotenv").config();
const { ethers } = require("./utils/get-ethers.js");
const abis = require("./constants/abis");
let { getAddresses, initAddresses } = require("./utils/contract-addresses");

let addresses; 
const nets = process.env.NETWORKS // "mainnet" or "testnet"
// Safely create a cross-chain contract wrapper, after addresses have loaded
async function CreateXChainContract(...args) {
    await initAddresses();
    addresses = getAddresses();
    return new XChainContract(...args);
}
// if(nets === "hardhat" && !process.env.HARDHAT_TESTING) { console.error("WARNING: need to run with npx hardhat test") }
// TODO : use DefaultProvider with backup providers, not just an AlchemyProvider

async function callContractWithNonceManager(contract, functionName, nonceManager, args) {
    // Try sending the transaction for 7 minutes, unless successful. Update the nonce every time.
    // !!!! TODO !!!!: This scheduling approach has an issue: It is possible--though not highly probable--for a
    // transaction to get stuck, always failing with a NONCE_EXPIRED error. This would lead to infinite loading
    // for the user. We need a better scheduling algorithm. This is only a temporary fix.
    let nonce = await nonceManager.getTransactionCount();
    let startTime = Date.now();
    while (Date.now() - startTime < 7 * 60 * 1000) {
        try {
            const populatedTx = await contract.populateTransaction[functionName](...args);
            populatedTx.nonce = nonce;
            return await nonceManager.sendTransaction(populatedTx);
        } catch (err) {
            if (err.code === "NONCE_EXPIRED") {
                const newNonce = await nonceManager.getTransactionCount();
                console.log(`Error calling contract: NONCE_EXPIRED (nonce == ${nonce}). Trying again with nonce ${newNonce}.`)
                nonce = newNonce;
            } else if (err._stack?.includes("Nonce too high")) {
                console.log(`Error calling contract: Nonce ${nonce} too high. Trying again with nonce ${nonce - 1}`)
                nonce -= 1;
            } else if (err.code?.includes("REPLACEMENT_UNDERPRICED")) {
                // We do not want to replace the tx, so we increment the nonce and try again
                console.log(`Error calling contract: REPLACEMENT_UNDERPRICED for nonce ${nonce}. Trying again with ${nonce + 1}`)
                nonce += 1;
            } else {
                throw err;
            }
        }
    }
    throw new Error("Failed to schedule transaction");
}

class XChainContract {
    constructor(contractName) {
        this.name = contractName;
        this.abi = abis[contractName];
        this.interface = new ethers.utils.Interface(this.abi);
        this.functionNames = Object.keys(this.interface.functions).map(f=>this.interface.functions[f].name);
        this.addresses = addresses[contractName][nets];
        this.providers = {};
        this.signers = {};
        this.nonceManagers = {};
        this.contracts = {};

        // Populate providers & signers
        for ( const networkName of Object.keys(this.addresses) ) {
            const address = this.addresses[networkName];
            const provider = (process.env.HARDHAT_TESTING === "true") ? ethers.provider : new ethers.providers.AlchemyProvider(networkName, process.env.ALCHEMY_APIKEY);
            const signer = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
            const nonceManager = new NonceManager(signer);
            const contract = new ethers.Contract(address, this.abi, nonceManager);
            this.providers[networkName] = provider;
            this.signers[networkName] = signer;
            this.nonceManagers[networkName] = nonceManager;
            this.contracts[networkName] = contract;
        }
        
        // Populate functions:
        for ( const functionName of this.functionNames ) {
            this[functionName] = async (...args) => {
                const responses = {};
                for ( const networkName of Object.keys(this.contracts) ) {
                    const contract = this.contracts[networkName];
                    const result = await callContractWithNonceManager(contract, functionName, this.nonceManagers[networkName], args);
                    responses[networkName] = result;
                }
                return responses;
            }
        }
    }
}

module.exports = {
    CreateXChainContract: CreateXChainContract,
    callContractWithNonceManager: callContractWithNonceManager
};