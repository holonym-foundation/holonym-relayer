
const { expect } = require("chai");
const { ethers } = require("hardhat");
const { deployPoseidon } = require("../utils/utils");

describe("Smart contract reading", function () {
    before(async function() {
        [this.account, this.admin, this.someAccount] = await ethers.getSigners();

        const _pt6 = await deployPoseidon();
        const _tree = await (await ethers.getContractFactory("IncrementalQuinTree", 
        {
            libraries : {
            PoseidonT6 : _pt6.address
            }
        })).deploy();

        const _hub = await (await ethers.getContractFactory("Hub", {
        libraries : {
            IncrementalQuinTree : _tree.address
            } 
        })).deploy(this.admin.address);

        this.hub = _hub;
    });

    
    describe("getLeaves", function() {
        it("works for empty leaves", async function() {
            expect(await this.hub.getLeaves()).to.deep.equal([]);
        });
    });
});