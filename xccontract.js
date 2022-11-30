require("dotenv").config();
const { ethers } = require("ethers");
const abis = require("./constants/abis.json");
const addresses = require("./constants/contract-addresses.json");

const nets = process.env.MAINNET === "true" ? "mainnet" : "testnet";

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
            const provider = new ethers.providers.AlchemyProvider("optimism-goerli", process.env.ALCHEMY_APIKEY);
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
                    const result = await contract[functionName](...args);
                    responses[networkName] = result;
                }
                return responses;
            }
        }

    }
    

}

export default XChainContract;