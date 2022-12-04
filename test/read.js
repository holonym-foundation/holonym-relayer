
const { expect } = require("chai");
const CreateCrossChainContract = require("../xccontract");
const testLeaves = require("./test-leaves.json");
require("@nomiclabs/hardhat-ethers");

describe("Smart contract reading", async function () {
    this.xchub = await CreateCrossChainContract("Hub");
    this.goerliHub = this.xchub.contracts["optimism-goerli"];
    describe("getting leaves", function() {
        it("works for empty leaves", async function() {
            expect(await this.goerliHub.getLeaves()).to.deep.equal([]);
            expect(await this.goerliHub.getLeavesFrom(0)).to.deep.equal([]);
        });
        it("getLeaves works for 1-5 leaves", async function() {
            await testLeaves.forEach(async leafParams => await this.xchub.addLeaf(
                leafParams.issuer, 
                leafParams.v, 
                leafParams.r, 
                leafParams.s, 
                Object.keys(leafParams.zkp).map(k=>leafParams.zkp[k]), // Convert struct to ethers format
                leafParams.zkpInputs
            )
            );
            console.log(await this.hub.getLeaves())
        })
    });
});