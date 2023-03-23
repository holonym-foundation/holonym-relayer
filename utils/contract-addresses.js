const { deployTestingContracts } = 
    process.env.HARDHAT_TESTING === "true" 
        ? require("../scripts/deploy-testing-contracts.js")
        : { deployTestingContracts : () => {} };

let addresses;
let addressesLoading;

async function initAddresses (){
    if(addresses) return;
    
    // This is run when initAddresses is called for the very first time
    if(!addressesLoading) {
        addressesLoading = true;
        addresses = (process.env.HARDHAT_TESTING === "true") ? await deployTestingContracts() : require("../constants/contract-addresses.json");
        addressesLoading = false;
    }
    // This loop is run when initAddresses is called twice so it doesn't try loading addresses twice
    while(addressesLoading) {
        await new Promise(resolve=>setTimeout(resolve, 500))
    }
    
}

module.exports = {
    getAddresses : () => addresses,
    getAddressesLoading : () => addressesLoading,
    initAddresses : initAddresses
}