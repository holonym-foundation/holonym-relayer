if (process.env.HARDHAT_TESTING==="true") {
    require("@nomiclabs/hardhat-ethers");
    module.exports.ethers = ethers;
} else {
    const { ethers } = require("ethers");
    module.exports.ethers = ethers;
}