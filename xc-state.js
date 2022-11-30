const XChainContract = require("./xccontract");
const addresses = require("./constants/contract-addresses.json");

// Global state tracker
class XChainState {
    constructor() {
        this.xchub = new XChainContract("Hub");
        this.xcleaves = {}; // Format: { "networkName" : ["leaf0", "leaf1", ..."leafn"] }
        this.xctrees = {}; // // Format: { "networkName" : MerkleTree }
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
        for (const leaf of newLeaves) {
            this.xctrees[networkName].insert(leaf);
            this.xcleaves[networkName].push(leaf);
        }
    }

    
}