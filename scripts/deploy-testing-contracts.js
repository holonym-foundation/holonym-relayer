const { poseidonContract } = require("circomlibjs");
const abiPoseidon = poseidonContract.generateABI(5);
const bytecodePoseidon = poseidonContract.createCode(5);
const { ethers } = require("hardhat");

const deployPoseidon = async () => {
    const [account] = await ethers.getSigners();
    const PoseidonContractFactory = new ethers.ContractFactory(
        abiPoseidon,
        bytecodePoseidon,
        account
    );
    return await PoseidonContractFactory.deploy();
}

// gets a Posiedon contract at address
const attachPoseidon = async (address) => {
    const [account] = await ethers.getSigners();
    const PoseidonContractFactory = new ethers.ContractFactory(
        abiPoseidon,
        bytecodePoseidon,
        account
    );
    return await PoseidonContractFactory.attach(address);
}

/* Initializes all relevant smart contracts and return their addresses
 * Can pass addresses for contracts that have already been deployed like such:
 * init({
 *   POSEIDONT6_ADDRESS : "0xabc",
 *   RESSTORE_ADDRESS : "0x123",
 * })
 */
async function deployTestingContracts(addresses) {
    const {
        POSEIDONT6_ADDRESS,
        INCREMENTALQUINTREE_ADDRESS,
        HUB_ADDRESS,
        COUNTRYVERIFIER_ADDRESS,
        RESSTORE_ADDRESS,
        ANTISYBILVERIFIER_ADDRESS,
        ANTISYBIL_ADDRESS,
        ANTISYBIL2_ADDRESS,

    } = 
    {
        ...addresses
    }
    
  
    const [admin] = await ethers.getSigners();
    const pt6 = POSEIDONT6_ADDRESS ? await attachPoseidon(POSEIDONT6_ADDRESS) : await deployPoseidon();
    await pt6.deployed();
    console.log("PoseidonT6 address is", pt6.address)
  
    const iqtFactory = await ethers.getContractFactory("IncrementalQuinTree", 
    {
        libraries : {
        PoseidonT6 : pt6.address
        }
    });
  
    const iqt = INCREMENTALQUINTREE_ADDRESS ? await iqtFactory.attach(INCREMENTALQUINTREE_ADDRESS) : await iqtFactory.deploy();
    await iqt.deployed();
    console.log("IncrementalQuinTree address is", iqt.address)

  
    const hubFactory = await ethers.getContractFactory("Hub", {
      libraries : {
          IncrementalQuinTree : iqt.address
      } 
    });
    const hub = HUB_ADDRESS ? await hubFactory.attach(HUB_ADDRESS) : await hubFactory.deploy(admin.address);
    await hub.deployed();
    console.log("Hub address is", hub.address)

  
    const router = await (await ethers.getContractFactory("ProofRouter")).attach(await hub.router());
    console.log("Router address is ", router.address);
    
    const pocFactory = await ethers.getContractFactory("ProofOfCountry");
    const poc = COUNTRYVERIFIER_ADDRESS ? await pocFactory.attach(COUNTRYVERIFIER_ADDRESS) : await pocFactory.deploy();
    await poc.deployed();
    console.log("ProofOfCountry address is", poc.address)
    console.log("roaklfjnalksdjfnaklsjnas", await router.routes("USResident"))
    if (await router.routes("USResident") === "0x0000000000000000000000000000000000000000") await router.addRoute("USResident", poc.address);
    
    // Yeah the nomenclature is bad; the same type of contract is called Proof of Country and Anti Sybil Verifier despite them both being verifiers
    const asvFactory = await ethers.getContractFactory("AntiSybilVerifier");
    const asv = ANTISYBILVERIFIER_ADDRESS ? await asvFactory.attach(ANTISYBILVERIFIER_ADDRESS) : await asvFactory.deploy();
    await asv.deployed();
    console.log("AntiSybilVerifier address is", asv.address)
    
    if (await router.routes("SybilResistance") === "0x0000000000000000000000000000000000000000") await router.addRoute("SybilResistance", asv.address);
    console.log("ROUTEabc SybilResistance", await router.routes("SybilResistance"))

    const iurFactory = await ethers.getContractFactory("IsUSResident"); 
    const iur = RESSTORE_ADDRESS ? await iurFactory.attach(RESSTORE_ADDRESS) : await (iurFactory).deploy(hub.address, "0x8281316ac1d51c94f2de77575301cef615adea84");
    await iur.deployed();
    console.log("IsUSResident address is", iur.address)

    const srFactory = await ethers.getContractFactory("SybilResistance"); 
    const sr = ANTISYBIL_ADDRESS ? await srFactory.attach(ANTISYBIL_ADDRESS) : await (srFactory).deploy(hub.address, "0x8281316ac1d51c94f2de77575301cef615adea84");
    await sr.deployed();

    const sr2 = ANTISYBIL2_ADDRESS ? await srFactory.attach(ANTISYBIL2_ADDRESS) : await (srFactory).deploy(hub.address, "0x8281316ac1d51c94f2de77575301cef615adea84"); //Change this address!
    await sr2.deployed();
  
    const result = {
      "Hub" : {"mainnet" : {"hardhat" : hub.address}, "testnet" : {"hardhat" : hub.address}}, 
      "IsUSResident" : {"mainnet" : {"hardhat" : iur.address}, "testnet" : {"hardhat" : iur.address}}, 
      "SybilResistance" : {"mainnet" : {"hardhat" : sr.address}, "testnet" : {"hardhat" : sr.address}}, 
      "SybilResistance2" : {"mainnet" : {"hardhat" : sr2.address}, "testnet" : {"hardhat" : sr2.address}}, 
    }

    return result
    
}

exports.attachPoseidon = attachPoseidon;
exports.deployPoseidon = deployPoseidon;
exports.deployTestingContracts = deployTestingContracts;