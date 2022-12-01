const assert = require("assert");
const XChainContract = require("./xccontract");
const addresses = require("./constants/contract-addresses.json");
const { Tree } = require("holo-merkle-utils");


// NOTE: make sure depth is 14, perhaps put this in /constants
const DEPTH = 14; 

/* Keeps track of cross-chain Merkle tree state */
class XChainState {
    constructor() {
        this.xchub = new XChainContract("Hub");
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
            this.xctrees[networkName].insert(leaf);
            this.xcleaves[networkName].push(leaf);
        }
    }
    
}

new XChainState();