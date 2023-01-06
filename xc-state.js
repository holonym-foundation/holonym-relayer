const assert = require("assert");
const { CreateXChainContract } = require('./xccontract')
const addresses = require("./constants/contract-addresses.json");
const { Tree } = require("holo-merkle-utils");


// NOTE: make sure depth is 14, perhaps put this in /constants
const DEPTH = 14; 

/* Keeps track of cross-chain Merkle tree state */
class XChainState {
    constructor() {
        this.xchub = new CreateXChainContract("Hub");
        this.xcleaves = {};  // Format: { "networkName" : ["leaf0", "leaf1", ..."leafn"] }
        this.xctrees = {}; // // Format: { "networkName" : MerkleTree }
        this.xchub.getLeaves().then(result => {
            assert(result, "Failed to retrieve Merkle leaves");
            this.xcleaves = result;
            Object.keys(this.xcleaves).forEach(networkName => (
                this.xctrees[networkName] = Tree(
                    DEPTH, 
                    this.xcleaves[networkName].map(leaf=>leaf.toString())
                )
            ));
            console.log(this.xctrees)
        });
    }
    // async forceRefreshAll() {
    //     this.xcleaves = await this.xchub.getLeaves();
    // }
    // async forceRefreshNetwork(networkName) {
    //     this.xcleaves[networkName] = this.xchub.contracts[networkName].getLeaves();
    // }
    async refreshNetwork(networkName) {
        const numLeaves = this.xcleaves[networkName].length;
        const newLeaves = await this.xchub.contracts[networkName].getLeavesFrom(numLeaves);
        // NOTE: re-entrancy if pushing into leaves fails, but I don't see a problem
        for (const leaf of newLeaves) {
            const leafStr = leaf.toString();
            this.xctrees[networkName].insert(leafStr);
            this.xcleaves[networkName].push(leafStr);
        }
    }
    async getCurrentTree(networkName) {
        this.refreshNetwork(networkName);
        return this.xctrees[networkName].toJSON();
    }
    
}


const xcs = new XChainState();
setTimeout(()=>console.log(xcs.getCurrentTree("optimism-goerli")), 3000)
