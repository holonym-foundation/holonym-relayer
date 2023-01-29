
const snarkjs = require("snarkjs");
const fs = require("fs");

module.exports.verifyProofCircom = async (circuitName, proof) => {
  const vKey = JSON.parse(fs.readFileSync(`./zk/pvkeys/circom/${circuitName}_verification_key.json`));
  console.log("verifyProofCircom: vkey", vKey, "proof", proof.proof, "inputs", proof.inputs)
  return await snarkjs.groth16.verify(vKey, proof.publicSignals, proof.proof);
}
