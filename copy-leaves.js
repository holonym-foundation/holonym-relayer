/**
 * One-off script to copy leaves from old on-chain 
 * Merkle tree into new off-chain Merkle tree.
 */

const { ethers } = require("ethers");
require('dotenv').config();
const { IncrementalMerkleTree } = require("@zk-kit/incremental-merkle-tree");
const { GetItemCommand, QueryCommand, PutItemCommand } = require("@aws-sdk/client-dynamodb");
const ABIs = require('./constants/abis');
const addresses = require('./constants/contract-addresses.json');
const { ddbClient } = require('./dynamodb');
const { poseidonHashQuinary } = require('./utils/utils');

async function main() {
  console.log('Getting on-chain leaves')
  // Get current on-chain leaves
  const provider = new ethers.providers.AlchemyProvider('optimism', process.env.ALCHEMY_APIKEY);
  const hubContract = new ethers.Contract(addresses.Hub.mainnet.optimism, ABIs.Hub, provider);
  const onChainLeaves = await hubContract.getLeaves();

  // Get current off-chain leaves
  console.log('Getting off-chain leaves')
  const leaves = []
  const LeavesTableName = "Leaves"; // name for table used in production
  for (let index = 0; index < 14 ** 5; index++) {
    await new Promise(resolve => setTimeout(resolve, 500));
    const data = await ddbClient.send(new GetItemCommand({
      TableName: LeavesTableName,
      Key: {
        "LeafIndex": {
          N: index.toString()
        }
      }
    }));
    const leaf = data.Item?.LeafValue?.S;
    if (!leaf) break;
    leaves.push(leaf);
  }
  console.log('leaves.length', leaves.length)

  // Diff on-chain leaves with off-chain leaves
  const leavesToCopy = 
    onChainLeaves
      .filter(leaf => !leaves.includes(leaf))
      .map(leaf => leaf.toString());
  console.log('leavesToCopy.length', leavesToCopy.length)

  // Copy leaves to off-chain Merkle tree
  let index = leaves.length;
  for (const leaf of leavesToCopy) {
    await new Promise(resolve => setTimeout(resolve, 1000));
    console.log('Copying leaf', leaf)
    await ddbClient.send(new PutItemCommand({
      TableName: LeavesTableName,
      Item: {
        'LeafIndex': {
          N: index.toString()
        },
        'LeafValue': {
          S: leaf
        },
        // "SignedLeaf": {
        //   S: signedLeaf
        // }
      }
    }));
    index++;
  }
}

main().then(() => console.log('done'))
