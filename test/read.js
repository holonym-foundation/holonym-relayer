
const { expect } = require("chai");
const CreateCrossChainContract = require("../xccontract");
const testLeaves = require("./test-leaves.json");
require("@nomiclabs/hardhat-ethers");

const NETWORK_NAME = "hardhat"; //when testing, the network name is just hardhat not, e.g., arbitrum

describe("Smart contract reading", function () {
    before(async function () {
        this.xcHub = await CreateCrossChainContract("Hub");
        this.hhHub = this.xcHub.contracts["hardhat"];
    })

    describe("getting leaves", function() {
        it("works for empty leaves", async function() {
            expect(await this.hhHub.getLeaves()).to.deep.equal([]);
            expect(await this.hhHub.getLeavesFrom(0)).to.deep.equal([]);
        });
        it("getLeaves works for 1-5 leaves", async function() {
            for (const leafParams of testLeaves.slice(0,3)) {
                await this.xcHub.addLeaf(
                    leafParams.issuer, 
                    leafParams.v, 
                    leafParams.r, 
                    leafParams.s, 
                    Object.keys(leafParams.zkp).map(k=>leafParams.zkp[k]), // Convert struct to ethers format
                    leafParams.zkpInputs
                )
            }
            const leaves = (await this.xcHub.getLeaves())["hardhat"]
            expect((await this.xcHub.getLeavesFrom(0))["hardhat"]).to.deep.equal(leaves)
            expect((await this.xcHub.getLeavesFrom(1))["hardhat"]).to.deep.equal(leaves.slice(1))
            expect((await this.xcHub.getLeavesFrom(2))["hardhat"]).to.deep.equal(leaves.slice(2))
            expect((await this.xcHub.getLeavesFrom(3))["hardhat"]).to.deep.equal([])
            expect((await this.xcHub.getLeavesFrom(4))["hardhat"]).to.deep.equal([])
        })
        
    });
});