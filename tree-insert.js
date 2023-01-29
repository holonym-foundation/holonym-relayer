// Forked from https://github.com/privacy-scaling-explorations/zk-kit/blob/main/packages/incremental-merkle-tree/src/insert.ts

const { PutItemCommand } = require("@aws-sdk/client-dynamodb");
const { ddbClient } = require("./dynamodb.js");

function checkParameter(value, name, ...types) {
  if (value === undefined) {
    throw new TypeError(`Parameter '${name}' is not defined`)
  }

  if (!types.includes(typeof value)) {
    throw new TypeError(`Parameter '${name}' is none of these types: ${types.join(", ")}`)
  }
}

// public insert(leaf: Node) {
//   this._root = _insert(leaf, this.depth, this.arity, this._nodes, this.zeroes, this._hash)
// }
// export default function insert(
//   leaf: Node,
//   depth: number,
//   arity: number,
//   nodes: Node[][],
//   zeroes: Node[],
//   hash: HashFunction
// ): Node {

/**
 * 
 * @param {*} leaf 
 * @param {*} depth 
 * @param {*} arity 
 * @param {*} nodes 
 * @param {*} zeroes 
 * @param {*} hash 
 * @param {boolean} backupInDb Whether the insertion procedure should also update the database.
 * @returns 
 */
module.exports.insert = async (leaf, depth, arity, nodes, zeroes, hash, backupInDb) => {
  checkParameter(leaf, "leaf", "number", "string", "bigint")

  if (nodes[0].length >= arity ** depth) {
    throw new Error("The tree is full")
  }

  let node = leaf
  let index = nodes[0].length

  for (let level = 0; level < depth; level += 1) {
    const position = index % arity
    const levelStartIndex = index - position
    const levelEndIndex = levelStartIndex + arity

    const children = []
    nodes[level][index] = node

    // Our addition: Store the node in the database
    if (backupInDb) {
      await ddbClient.send(new PutItemCommand({
        TableName: 'MerkleTree',
        Item: {
          'NodeLocation': {
            S:`${level}-${index}`
          },
          'NodeValue': {
            S: node
          }
        }
      }));
    }
    
    for (let i = levelStartIndex; i < levelEndIndex; i += 1) {
      if (i < nodes[level].length) {
        children.push(nodes[level][i])
      } else {
        children.push(zeroes[level])
      }
    }

    node = hash(children)
    index = Math.floor(index / arity)
  }

  return node
}
