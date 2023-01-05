
const chai = require("chai");
const { expect } = chai;
const CreateCrossChainContract = require("../xccontract");
const testLeaves = require("./test-leaves.json");
require("@nomiclabs/hardhat-ethers");
const app_ = require("../index.js").appPromise;
const chaiHTTP = require("chai-http");
chai.use(chaiHTTP);

const NETWORK_NAME = "hardhat"; //when testing, the network name is just hardhat not, e.g., arbitrum

describe("Smart contract reading", function () {
    before(async function () {
        this.server = await app_;
        this.request = chai.request(this.server);
        this.xcHub = await CreateCrossChainContract("Hub");
        this.hhHub = this.xcHub.contracts["hardhat"];
    })

    describe("Empty Set", function() {
        it("works for empty set of leaves", async function() {
            expect(await this.hhHub.getLeaves()).to.deep.equal([]);
            expect(await this.hhHub.getLeavesFrom(0)).to.deep.equal([]);
            expect((await this.xcHub.getLeaves())["hardhat"]).to.deep.equal([]);
            expect((await this.xcHub.getLeavesFrom(0))["hardhat"]).to.deep.equal([]);

            this.request.get("/getLeaves/hardhat").end((err,response)=>{
               expect(response.body).to.deep.equal([]);
            })
        });
    });
    describe("Non-empty sets", function() {
        before(async function() {
            // Add 3 test leaves:
            for (const leafParams of testLeaves.slice(0,3).map(x=>x.publicOALParams)) {
                await this.xcHub.addLeaf(
                    leafParams.issuer, 
                    leafParams.signature.v,
                    leafParams.signature.r,
                    leafParams.signature.s,
                    Object.keys(leafParams.proof.proof).map(k=>leafParams.proof.proof[k]), // Convert struct to ethers format
                    leafParams.proof.inputs
                )
            };
        });
        it("getLeavesFrom works for multiple leaves", async function() {
            const leaves = (await this.xcHub.getLeaves())["hardhat"]
            expect((await this.xcHub.getLeavesFrom(0))["hardhat"]).to.deep.equal(leaves)
            expect((await this.xcHub.getLeavesFrom(1))["hardhat"]).to.deep.equal(leaves.slice(1))
            expect((await this.xcHub.getLeavesFrom(2))["hardhat"]).to.deep.equal(leaves.slice(2))
            expect((await this.xcHub.getLeavesFrom(3))["hardhat"]).to.deep.equal([])
            expect((await this.xcHub.getLeavesFrom(4))["hardhat"]).to.deep.equal([])
        });

        // TODO: this test
        it("Merkle tree updates work", async function() {
            expect("TODO").to.equal("Not Implemented yet");
            // Implementation here, code mixed with pseudocode for some unfinished lines:
            // const leaves = (await this.xcHub.getLeaves())["hardhat"]
            // let testTree = new MerkleTree(leaves) // instantiation here is just pseudocode
            // this.request.get("/getTree/hardhat").end((err,response)=>{
            //     expect(response.body).to.deep.equal(testTree.toJSON());
            //  })
            // let newLeaf = testTrees[3]
            // testTree.add(newLeaf.zkpInputs[1]) // zkpInputs[1] is the new leaf
            // await this.xcHub.addLeaf(
            //     leafParams.issuer, 
            //     leafParams.v, 
            //     leafParams.r, 
            //     leafParams.s, 
            //     Object.keys(leafParams.zkp).map(k=>leafParams.zkp[k]), // Convert struct to ethers format
            //     leafParams.zkpInputs
            // )
            // this.request.get("/getTree/hardhat").end((err,response)=>{
            //     expect(response.body).to.deep.equal(testTree.toJSON());
            //  })
            
        });
        
    });
});