const { poseidon } = require("circomlibjs-old");
const { ethers } = require("hardhat");
const { IncrementalMerkleTree } = require("@zk-kit/incremental-merkle-tree");
const sgMail = require("@sendgrid/mail");


/* creates a Merkle proof in the appropriate JSON format -- leaf is the leaf to make a proof for, and treeData is the data returned from the relayer's /getTree endpoint*/
async function createMerkleProof(leaf, treeData) {
    const tree = new IncrementalMerkleTree(poseidon, 14, "0", 5);
    // NOTE: _nodes and _zeroes are private readonly variables in the `incremental-merkle-tree.d` file,
    // but the JavaScript implementation doesn't seem to enforce these constraints.
    tree._root = treeData._root;
    tree._nodes = treeData._nodes;
    tree._zeroes = treeData._zeroes;
  
    const leaves = tree._nodes[0];
    if (leaves.indexOf(leaf) === -1) {
      console.error(
        `Could not find leaf ${leaf} from querying on-chain list of leaves ${leaves}`
      );
    }
  
    const index = tree.indexOf(leaf);
    const merkleProof = tree.createProof(index);
    const [root_, leaf_, path_, indices_] = convertMerkleProofFormat(
      merkleProof,
      poseidon
    );
  
    return {
      root: root_,
      leaf: leaf_,
      path: path_,
      indices: indices_,
      formattedProof: [leaf_, ...path_, ...indices_].flat()
    };
  }
  
  /**
   * (Forked from holo-merkle-utils)
   * es createProof outputs to ZoKrates format
   */
function convertMerkleProofFormat(proof, hash) {
    // Insert the digest of the leaf at every level:
    let digest = proof.leaf;
    for (let i = 0; i < proof.siblings.length; i++) {
        proof.siblings[i].splice(proof.pathIndices[i], 0, digest);
        digest = hash(proof.siblings[i]);
    }
    
    // serialize
    const argify = (x) => ethers.BigNumber.from(x).toString();
    const args = [
      argify(proof.root),
      argify(proof.leaf),
      proof.siblings.map((x) => x.map((y) => argify(y))),
      proof.pathIndices.map((x) => argify(x)),
    ];
    return args;
}

function poseidonHashQuinary(input) {
  if (input.length !== 5 || !Array.isArray(input)) {
    throw new Error("input must be an array of length 5");
  }
  return poseidon(input.map((x) => ethers.BigNumber.from(x).toString())).toString();
}

async function sendEmail(to, subject, text, html) {
  sgMail.setApiKey(process.env.SENDGRID_API_KEY);
  const msg = {
    to, // "test@example.com"
    from: "idservices@holonym.id",
    subject,
    text,
    html,
  };
  try {
    await sgMail.send(msg);
  } catch (error) {
    if (error.response) {
      console.error(error.response.body);
    } else {
      console.error(error);
    }
  }
}

exports.createMerkleProof = createMerkleProof;
exports.poseidonHashQuinary = poseidonHashQuinary;
exports.sendEmail = sendEmail;
