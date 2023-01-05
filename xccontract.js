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
                    const result = await contract[functionName](...args);
                    responses[networkName] = result;
                }
                return responses;
            }
        }

    }
    

}

module.exports = CreateXChainContract;