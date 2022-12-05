
const { expect } = require("chai");
const CreateCrossChainContract = require("../xccontract");
const testLeaves = require("./test-leaves.json");
require("@nomiclabs/hardhat-ethers");

const NETWORK_NAME = "hardhat"; //when testing, the network name is just hardhat not, e.g., arbitrum

describe("Smart contract reading", function () {
    before(async function () {
        this.xcHub = await CreateCrossChainContract("Hub");
        this.hhHub = this.xcHub.contracts["hardhat"];
        console.log("hubbbb", this.hhHub.address)
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
            console.log(await this.xcHub.getLeaves())
        })
    });
});