const util = require("util");
const exec = util.promisify(require("child_process").exec);
const chai = require("chai");
const { expect } = chai;
const CreateCrossChainContract = require("../xccontract");
const testLeaves = require("./test-leaves.json");
require("@nomiclabs/hardhat-ethers");
const app_ = require("../index.js").appPromise;
const chaiHTTP = require("chai-http");
const { poseidon } = require("circomlibjs-old");
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


    // This is intended to test the nonce race condition
    it("addLeaf/ should not fail when it receives 4 valid requests in very short period", async function() {
        const publicOALParams = testLeaves.map(leaf => leaf.publicOALParams)
        const responses = await Promise.all(publicOALParams.map(params => chai.request(this.server).post("/addLeaf").send(params)))
        for (const resp of responses) {
            expect(resp).to.have.status(200);
        }
    });

    // This is intended to test the nonce race condition. Specifically, it is testing that the nonce is not incremented if the transaction fails
    it.only("addLeaf/ should not fail if it receives, at the same time, 1 valid request and 1 request whose tx reverts", async function() {
        const validResp1 = await chai.request(this.server).post("/addLeaf").send(testLeaves[0].publicOALParams);
        expect(validResp1).to.have.status(200);

        // tx should fail for first request and succeed for second one
        const responses = await Promise.all([
            // Send the same leaf twice. Sending the same leaf twice is a way to test that the tx fails once it hits the network and not before
            chai.request(this.server).post("/addLeaf").send(testLeaves[0].publicOALParams),
            chai.request(this.server).post("/addLeaf").send(testLeaves[1].publicOALParams)
        ])
        expect(responses[0], "Invalid transaction succeeded but should have reverted").to.have.status(400);
        expect(responses[1], "Valid transaction failed but should have succeeded").to.have.status(200);
    });

    it("Integration test: add some leaves and prove facts about them (integration test as two unit tests would take a while to run)", async function() {
        const fakeCredsToStore = {
            sigDigest: randomBytes(16).toString("hex"),
            encryptedCredentials: randomBytes(16).toString("hex"),
            encryptedSymmetricKey: randomBytes(16).toString("hex"),
        }
        // Add a test leaf (proof.inputs[1] is new leaf that will be added to the Merkle tree)
        const newLeaf = BigInt(testLeaves[0].publicOALParams.proof.inputs[1]).toString() 
        await chai.request(this.server).post("/addLeaf").send(testLeaves[0].publicOALParams)
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
        
        // Submit the proof to the relayer
        console.log("sending to relayer....")
        await chai.request(this.server).post("/writeProof/SybilResistance/hardhat").send({writeProofArgs: proofObject});

        // Check that it has been written:
        // Wait for the block to mine
        const delay = ms => new Promise(res => setTimeout(res, ms));
        // Wait 30s
        // await delay(30000)
        expect(await this.xcSR.isUniqueForAction(anotherAccount.address, actionId)).to.deep.equal({hardhat : true});
    });
});