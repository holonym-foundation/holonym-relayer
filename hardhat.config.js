/** @type import('hardhat/config').HardhatUserConfig */
require("dotenv").config();
require("@nomiclabs/hardhat-waffle");
require("@nomiclabs/hardhat-ethers");
process.env.HARDHAT_TESTING = "true";
module.exports = {
  solidity: "0.8.17",
  defaultNetwork: "hardhat",
  networks: {
    hardhat: {
      from: "0xC8834C1FcF0Df6623Fc8C8eD25064A4148D99388", // Send transactions from this address by default
      accounts: [
        { privateKey: process.env.PRIVATE_KEY, balance: "2110000000000000000000000" },
        {
          privateKey:
            "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
          balance: "10000000000000000000000",
        },
        {
          privateKey:
            "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",
          balance: "15100000000000000000000",
        },
      ]
    }
  },
  mocha : {
    timeout : 100000
  }
};
