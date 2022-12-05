require("dotenv").config();
const { ethers } = require("ethers")
const { deployTestingContracts } = require("./scripts/deploy-testing-contracts.js");
const abis = require("./constants/abis");
let addresses;
let addressesLoading;

async function initAddresses (){
    if(addresses) return;
    
    // This is run when initAddresses is called for the very first time
    if(!addressesLoading) {
        addressesLoading = true;
        addresses = (process.env.HARDHAT_TESTING === "true") ? await deployTestingContracts() : require("./constants/contract-addresses.json");
    }
    // This loop is run when initAddresses is called twice so it doesn't try loading addresses twice
    while(addressesLoading) {
        await new Promise(resolve=>setTimeout(resolve, 500))
    }
    
}

const nets = process.env.NETWORKS // "mainnet" or "testnet"
// Safely create a cross-chain contract wrapper, after addresses have loaded
async function CreateXChainContract(...args) {
    await initAddresses();
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
        this.contracts = {};

        // Populate providers & signers
        for ( const networkName of Object.keys(this.addresses) ) {
            const address = this.addresses[networkName];
            if(process.env.HARDHAT_TESTING === "true") console.log("adding provider", ethers.provider)
            const provider = (process.env.HARDHAT_TESTING === "true") ? ethers.provider : new ethers.providers.AlchemyProvider(networkName, process.env.ALCHEMY_APIKEY);
            const signer = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
            const contract = new ethers.Contract(address, this.abi, signer);
            this.providers[networkName] = provider;
            this.signers[networkName] = signer;
            this.contracts[networkName] = contract;
        }
        
        // Populate functions:
        for ( const functionName of this.functionNames ) {
            this[functionName] = async (...args) => {
                const responses = {};
                for ( const networkName of Object.keys(this.contracts) ) {
                    const contract = this.contracts[networkName];
                    console.log(this.contracts[networkName], "ahijllkjhlkjjh")
                    const result = await contract[functionName](...args);
                    responses[networkName] = result;
                }
                return responses;
            }
        }

    }
    

}

module.exports = CreateXChainContract;