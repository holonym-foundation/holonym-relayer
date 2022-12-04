/** @type import('hardhat/config').HardhatUserConfig */
require("@nomiclabs/hardhat-waffle");
require("@nomiclabs/hardhat-ethers");
process.env.HARDHAT_TESTING = "true";
module.exports = {
  solidity: "0.8.17",
};
