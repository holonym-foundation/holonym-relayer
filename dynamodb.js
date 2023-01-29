const { DynamoDBClient, CreateTableCommand } = require("@aws-sdk/client-dynamodb");

const MerkleTreeTableName = process.env.NODE_ENV == "development" ? "MerkleTree-dev" : "MerkleTree";

const ddbClient = new DynamoDBClient({ 
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
  region: "us-east-1"
});

const createTreeTableIfNotExists = async () => {
  try {
    const params = {
      AttributeDefinitions: [
        {
          // Every key should be of the format: "<level>-<index>", where level 0 is the level of the leaves,
          // and level 1 is the level of the parents of the leaves, and so on. The index is the index of the node
          // at that level. For example, the first leaf is at level 0, index 0, and its parent is at level 1, index 0.
          // Example values: "0-0" for the first leaf, "1-0" for the first leaf's parent
          AttributeName: "NodeLocation",
          AttributeType: "S",
        },
        // {
        //   // value of a node in the Merkle tree
        //   AttributeName: "NodeValue",
        //   AttributeType: "S",
        // },
      ],
      KeySchema: [
        {
          "KeyType": "HASH",
          "AttributeName": "NodeLocation"
        },
      ],
      ProvisionedThroughput: {
        ReadCapacityUnits: 1,
        WriteCapacityUnits: 1,
      },
      TableName: MerkleTreeTableName,
      StreamSpecification: {
        StreamEnabled: false,
      },
    };
    // CreateTableCommand throws if table already exists.
    const data = await ddbClient.send(new CreateTableCommand(params));
    console.log("MerkleTree table created in DynamoDB", data);
  } catch (err) {
    if (err.name === "ResourceInUseException") {
      console.log("MerkleTree table already exists in DynamoDB");
    } else {
      console.log("Error", err);
    }
  }
};

module.exports = {
  MerkleTreeTableName,
  ddbClient,
  createTreeTableIfNotExists,
};

