const util = require("util");
const exec = util.promisify(require("child_process").exec);
const chai = require("chai");
const { expect } = chai;
const { GetItemCommand, DeleteItemCommand } = require("@aws-sdk/client-dynamodb");
const { CreateXChainContract } = require('../xccontract')
const testLeaves = require("./test-leaves.json");
const testCredsV2 = require('./test-creds-v2.json');
const testUtils = require('../utils/test-utils');
require("@nomiclabs/hardhat-ethers");
const app_ = require("../index.js").appPromise;
const chaiHTTP = require("chai-http");
const { poseidon } = require("circomlibjs-old");
const { ddbClient } = require('../dynamodb')
const { randomBytes } = require("ethers/lib/utils");
const { createMerkleProof } = require("../utils/utils");
const { readFileSync } = require("fs");
chai.use(chaiHTTP);

const NETWORK_NAME = "hardhat"; //when testing, the network name is just hardhat not, e.g., arbitrum

const LeavesTableName = 'Leaves-dev'

describe.only("Writing", function () {
    before(async function () {
        // (v2) Clear the first <testCredsV2.length> leaves from the Tree-dev table in the database
        for (let i = 0; i < testCredsV2.length; i++) {
            await ddbClient.send(new DeleteItemCommand({
                TableName: LeavesTableName,
                Key: {
                    "LeafIndex": {
                        N: i.toString()
                    }
                }
            }));
        }
        console.log(`Deleted first 4 leaves from ${LeavesTableName} table`)

        this.server = await app_;
        this.request = chai.request(this.server);
        this.xcHub = await CreateXChainContract("Hub");
        this.xcSR = await CreateXChainContract("SybilResistance");
        this.xcUS = await CreateXChainContract("IsUSResident");  
        this.xcRoots = await CreateXChainContract("Roots");      
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
    it("addLeaf/ should not fail if it receives, at the same time, 1 valid request and 1 request whose tx reverts", async function() {
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

    describe.only("v2", function() {

        before(async function() {
            // Sleep for 500ms to let the server initialize the Merkle tree
            await new Promise(res => setTimeout(res, 500));
        });

        it("v2/addLeaf/ should correctly update the Leaves table in the database when it receives a valid onAddLeaf proof", async function() {
            const leafIndex = 0;
            const testCreds = testCredsV2[leafIndex];
            const onAddLeafProof = await testUtils.onAddLeafProof(testCreds);
            const response = await chai.request(this.server).post("/v2/addLeaf").send(onAddLeafProof);
            expect(response).to.have.status(200);

            const data = await ddbClient.send(new GetItemCommand({
                TableName: LeavesTableName,
                Key: {
                    "LeafIndex": {
                        N: leafIndex.toString()
                    }
                }
            }));
            expect(data?.Item?.LeafValue?.S).to.equal(testCreds.newLeaf);
        });

        it("v2/leafExists/ should return true if the provided leaf is in the Merkle tree", async function() {
            const response = await chai.request(this.server).get(`/v2/leafExists/${testCredsV2[0].newLeaf}`);
            expect(response.body.exists).to.equal(true);
        });

        it("v2/leafExists/ should return false if the provided leaf is not in the Merkle tree", async function() {
            const response = await chai.request(this.server).get(`/v2/leafExists/0xLEAF_NOT_IN_TREE`);
            expect(response.body.exists).to.equal(false);
        });

        it("v2/addLeaf/ should update the in-memory Merkle tree (as reported by v2/getLeaves) when it receives a valid onAddLeaf proof", async function() {
            const testCreds = testCredsV2[1];
            const onAddLeafProof = await testUtils.onAddLeafProof(testCreds);
            const addLeafResponse = await chai.request(this.server).post("/v2/addLeaf").send(onAddLeafProof);
            expect(addLeafResponse).to.have.status(200);
            const getLeavesResponse = await chai.request(this.server).get("/v2/getLeaves");
            expect(getLeavesResponse.body).to.include(testCreds.newLeaf);
        });

        it("v2/addLeaf/ should return an error when it receives an onAddLeaf proof that has already been used", async function() {
            const testCreds = testCredsV2[1];
            const onAddLeafProof = await testUtils.onAddLeafProof(testCreds);
            const addLeafResponse = await chai.request(this.server).post("/v2/addLeaf").send(onAddLeafProof);
            expect(addLeafResponse).to.have.status(400);
        });

        it("v2/getTree/ and Roots contract should report the same Merkle root", async function() {
            const getTreeResponse = await chai.request(this.server).get("/v2/getTree");
            const rootAsReportedByRelayer = getTreeResponse?.body?._root;
            const rootAsReportedByRoots = await this.xcRoots.contracts[NETWORK_NAME].mostRecentRoot();
            expect(rootAsReportedByRelayer).to.equal(rootAsReportedByRoots.toString());
        });

        it("v2/getLeaves/ should return all and only the leaves that have been added", async function() {
            const response = await chai.request(this.server).get("/v2/getLeaves");
            expect(response.body).to.deep.equal(testCredsV2.slice(0, 2).map(creds => creds.newLeaf));
        });

        it("v2/addLeaf/ should update the on-chain root when it receives a valid onAddLeaf proof", async function() {
            const rootBefore = await this.xcRoots.contracts[NETWORK_NAME].mostRecentRoot();
            
            const testCreds = testCredsV2[2];
            const onAddLeafProof = await testUtils.onAddLeafProof(testCreds);
            const addLeafResponse = await chai.request(this.server).post("/v2/addLeaf").send(onAddLeafProof);
            expect(addLeafResponse).to.have.status(200);

            const rootAfter = await this.xcRoots.contracts[NETWORK_NAME].mostRecentRoot();
            expect(rootBefore).to.not.equal(rootAfter);
        });
    });
});