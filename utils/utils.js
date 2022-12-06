const { poseidonContract } = require("circomlibjs");
const abiPoseidon = poseidonContract.generateABI(5);
const bytecodePoseidon = poseidonContract.createCode(5);
const { poseidon } = require("circomlibjs-old");
const { ethers } = require("hardhat");
const { IncrementalMerkleTree } = require("@zk-kit/incremental-merkle-tree");

const deployPoseidon = async () => {
    const [account] = await ethers.getSigners();
    const PoseidonContractFactory = new ethers.ContractFactory(
        abiPoseidon,
        bytecodePoseidon,
        account
    );
    return await PoseidonContractFactory.deploy();
}

poseidon
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

exports.deployPoseidon = deployPoseidon;
exports.createMerkleProof = createMerkleProof;