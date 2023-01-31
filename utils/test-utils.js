const { groth16 } = require("snarkjs");

module.exports.onAddLeafProof = async (data) => {
  const params = {
    pubKeyX: data.pubkey.x,
    pubKeyY: data.pubkey.y,
    R8x: data.signature.R8.x,
    R8y: data.signature.R8.y,
    S: data.signature.S,
    signedLeaf: data.leaf,
    newLeaf: data.newLeaf,
    signedLeafSecret: data.creds.secret,
    newLeafSecret: data.creds.newSecret,
    iat: data.creds.iat,
    customFields: data.creds.customFields,
    scope: data.creds.scope
  }
  // return await groth16.fullProve(params, "https://preproc-zkp.s3.us-east-2.amazonaws.com/circom/onAddLeaf_js/onAddLeaf.wasm", "https://preproc-zkp.s3.us-east-2.amazonaws.com/circom/onAddLeaf_0001.zkey");
  return await groth16.fullProve(params, "./zk/test/onAddLeaf.wasm", "./zk/test/onAddLeaf_0001.zkey");
}
