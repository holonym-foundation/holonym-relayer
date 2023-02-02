const { DynamoDBClient, CreateTableCommand } = require("@aws-sdk/client-dynamodb");

const LeavesTableName = process.env.NODE_ENV == "development" ? "Leaves-dev" : "Leaves";

const ddbClient = new DynamoDBClient({ 
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
  region: "us-east-1"
});

// We store just the leaves instead of the whole Merkle tree because we can construct the tree
// from the leaves and storing the whole tree adds unnecessary overhead (e.g., ensuring that
// series of node updates that constitutes a leaf insertion procedure is atomic).
const createLeavesTableIfNotExists = async () => {
  try {
    const params = {
      AttributeDefinitions: [
        {
          // position of leaf in the array of leaves
          AttributeName: "LeafIndex",
          AttributeType: "N",
        },
        {
          // The signed leaf used in the onAddLeaf proof used to add the leaf
          AttributeName: "SignedLeaf",
          AttributeType: "S",
        }
      ],
      KeySchema: [
        {
          "KeyType": "HASH",
          "AttributeName": "LeafIndex"
        },
      ],
      ProvisionedThroughput: {
        ReadCapacityUnits: 1,
        WriteCapacityUnits: 1,
      },
      TableName: LeavesTableName,
      GlobalSecondaryIndexes: [
        {
          IndexName: "SignedLeavesIndex",
          KeySchema: [
            {
              AttributeName: "SignedLeaf",
              KeyType: "HASH",
            },
          ],
          Projection: {
            ProjectionType: "ALL",
          },
          ProvisionedThroughput: {
            ReadCapacityUnits: 1,
            WriteCapacityUnits: 1,
          },
        }
      ],
      StreamSpecification: {
        StreamEnabled: false,
      },
    };
    // CreateTableCommand throws if table already exists.
    const data = await ddbClient.send(new CreateTableCommand(params));
    console.log(`${LeavesTableName} table created in DynamoDB`, data);
  } catch (err) {
    if (err.name === "ResourceInUseException") {
      console.log(`${LeavesTableName} table already exists in DynamoDB`);
    } else {
      console.error("Error", err);
    }
  }
};

module.exports = {
  LeavesTableName,
  ddbClient,
  createLeavesTableIfNotExists,
};
