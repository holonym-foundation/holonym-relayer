const util = require("util");
const exec = util.promisify(require("child_process").exec);
const chai = require("chai");
const { expect } = chai;
const CreateCrossChainContract = require("../xccontract");
const testLeaves = require("./test-leaves.json");
require("@nomiclabs/hardhat-ethers");
const app_ = require("../index.js").appPromise;
const chaiHTTP = require("chai-http");
const { poseidon } = require('circomlibjs-old');
const { randomBytes } = require("ethers/lib/utils");
const { createMerkleProof } = require("../utils/utils");
const { readFileSync } = require("fs");
chai.use(chaiHTTP);


const NETWORK_NAME = "hardhat"; //when testing, the network name is just hardhat not, e.g., arbitrum

describe.only("Writing", function () {
    before(async function () {
        this.server = await app_;
        this.request = chai.request(this.server);
        this.xcHub = await CreateCrossChainContract("Hub");
        this.xcSR = await CreateCrossChainContract("SybilResistance");
        this.xcUS = await CreateCrossChainContract("IsUSResident");
        
    })


    it("Integration test: add some leaves and prove facts about them (integration test as two unit tests would take a while to run)", async function() {
        const fakeCredsToStore = {
            sigDigest: randomBytes(16).toString("hex"),
            encryptedCredentials: randomBytes(16).toString("hex"),
            encryptedSymmetricKey: randomBytes(16).toString("hex"),
        }
        // Add a test leaf (zkpInputs[1] is new leaf that will be added to the Merkle tree)
        const newLeaf = BigInt(testLeaves[0].publicOALParams.zkpInputs[1]).toString() 
        await chai.request(this.server).post("/addLeaf").send({addLeafArgs: testLeaves[0].publicOALParams, credsToStore: fakeCredsToStore})
        const response = await chai.request(this.server).get("/getLeaves/hardhat");
        expect(response.body).to.deep.equal([newLeaf]);
        
        const response2 = await chai.request(this.server).get("/getTree/hardhat");
        const merkleTree = response2.body;
        const merkleProof = await createMerkleProof(newLeaf, merkleTree);
        console.log("merkle tree ", JSON.stringify(merkleTree));
        const [account, anotherAccount] = await ethers.getSigners();
        const [issuerAddress, nullifier, field0, field1, field2, field3] = testLeaves[0].privatePreimage;
        const actionId = "69696969";
        const masala = poseidon([actionId, nullifier]);
        
        const proofArgs = `${[
            merkleProof.root, 
            ethers.BigNumber.from(anotherAccount.address).toString(), // It doesn't matter which address
            issuerAddress,
            actionId,
            masala,
            field0,
            field1,
            field2,
            field3,
            nullifier
        ].join(" ")
        } ${ merkleProof.formattedProof.join(" ") }`;
        await exec(`zokrates compute-witness -a ${proofArgs} -i zk/compiled/antiSybil.out -o tmp.witness`);
        await exec(`zokrates generate-proof -i zk/compiled/antiSybil.out -w tmp.witness -p zk/pvkeys/antiSybil.proving.key -j tmp.proof.json`);
        const proofObject = JSON.parse(readFileSync("tmp.proof.json").toString());
        console.log("proof object", proofObject);
        // await expect(
        //     this.resStore.prove(this.proofObject.proof, this.proofObject.inputs)
        // ).to.be.revertedWith("Proof must come from authority address");

        // const zkProof = await 
        // const response3 = await
    });

    describe("Non-empty sets", function() {
        // before(async function() {
        //     // Add 3 leaves:
        //     for (const leafParams of testLeaves.slice(0,3)) {
        //         await this.xcHub.addLeaf(
        //             leafParams.issuer, 
        //             leafParams.v, 
        //             leafParams.r, 
        //             leafParams.s, 
        //             Object.keys(leafParams.zkp).map(k=>leafParams.zkp[k]), // Convert struct to ethers format
        //             leafParams.zkpInputs
        //         )
        //     };
        // });
        // it("getLeavesFrom works for multiple leaves", async function() {
        //     const leaves = (await this.xcHub.getLeaves())["hardhat"]
        //     expect((await this.xcHub.getLeavesFrom(0))["hardhat"]).to.deep.equal(leaves)
        //     expect((await this.xcHub.getLeavesFrom(1))["hardhat"]).to.deep.equal(leaves.slice(1))
        //     expect((await this.xcHub.getLeavesFrom(2))["hardhat"]).to.deep.equal(leaves.slice(2))
        //     expect((await this.xcHub.getLeavesFrom(3))["hardhat"]).to.deep.equal([])
        //     expect((await this.xcHub.getLeavesFrom(4))["hardhat"]).to.deep.equal([])
        // });

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