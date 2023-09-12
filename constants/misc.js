const SybilGovIDABI = require('./abis/SybilResistanceV2.json');
const SybilPhoneABI = require('./abis/SybilResistancePhone.json');
const IsUSResidentV2ABI = require('./abis/IsUSResidentV2.json');

module.exports.backupTreePath= './backup-trees';

module.exports.whitelistedIssuers = [
  '0x8281316ac1d51c94f2de77575301cef615adea84', // Holonym id-server
  '0xfc8a8de489efefb91b42bb8b1a6014b71211a513', // Holonym phone-number-server if NODE_ENV == 'development'
  '0xb625e69ab86db23c23682875ba10fbc8f8756d16', // Holonym phone-number-server
]

// A mapping of proof name to the address of the NFT contract on Optimism
module.exports.nftAddresses = {
  SybilResistanceV2: '0x7a81f2f88b0ee30ee0927c9f672487689c6dd7ce',
  SybilResistancePhone: '0xe337ad5aa1cb84e12a7aab85aed1ab6cb44c4a8e',
  IsUSResidentV2: '0x25b42489b7647863918af127aaaa3243ec605aca'
}

module.exports.nftABIs = {
  SybilResistanceV2: SybilGovIDABI,
  SybilResistancePhone: SybilPhoneABI,
  IsUSResidentV2: IsUSResidentV2ABI
}