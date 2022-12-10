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

describe("Writing", function () {
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