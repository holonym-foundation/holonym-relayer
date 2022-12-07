if (process.env.HARDHAT_TESTING==="true") {
    require("@nomiclabs/hardhat-ethers");
    console.log("testing: ethers is", ethers)
    module.exports.ethers = ethers;
} else {
    const { ethers } = require("ethers");
    console.log("running: ethers is", ethers)
    module.exports.ethers = ethers;
}