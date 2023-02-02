const { 
  DynamoDBClient,
  CreateTableCommand,
  PutItemCommand,
  GetItemCommand,
  QueryCommand
} = require("@aws-sdk/client-dynamodb");
const { sendEmail } = require('./utils/utils');

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

async function handleDynamoDbErrorNotification(err) {
  if (err.name === "ProvisionedThroughputExceededException") {
    // Send email to admin(s)
    if (process.env.NODE_ENV !== 'development' && process.env.ADMIN_EMAILS) {
      for (const email of process.env.ADMIN_EMAILS.split(',')) {
        await sendEmail(
          email,
          "ProvisionedThroughputExceededException",
          err.message
        );
      }
    }
  }
}

/**
 * Put leaf into database
 * @param {string} newLeaf - the new leaf to add to the Merkle tree
 * @param {string} signedLeaf - the signed leaf used in the onAddLeaf proof
 * @param {number} leafIndex - the index at which to put the new leaf
 */
async function putLeaf(newLeaf, signedLeaf, leafIndex) {
  try {
    await ddbClient.send(new PutItemCommand({
      TableName: LeavesTableName,
      Item: {
        'LeafIndex': {
          N: leafIndex.toString()
        },
        'LeafValue': {
          S: newLeaf
        },
        "SignedLeaf": {
          S: signedLeaf
        }
      }
    }));
    console.log(`Added leaf ${newLeaf} to database at index ${leafIndex}`)
  } catch (err) {
    await handleDynamoDbErrorNotification(err);
    console.error("putLeaf: ", err);
    // Throw error to display on frontend
    throw new Error("Failed to put leaf");
  }
}

/**
 * Get the leaf item at the given index
 * @param {number} index 
 */
async function getLeafAtIndex(index) {
  try {
    return await ddbClient.send(new GetItemCommand({
      TableName: LeavesTableName,
      Key: {
        "LeafIndex": {
          N: index.toString()
        }
      }
    }));
  } catch (err) {
    await handleDynamoDbErrorNotification(err);
    console.error("getLeafAtIndex: ", err);
    // Throw error that can be displayed on the frontend
    throw new Error("An error occurred while querying the database");
  }
}

/**
 * Query the database for the leaf items that have the given signed leaf.
 * (There should only be one leaf item for any given signed leaf.)
 * @param {string} signedLeaf 
 */
async function getLeavesBySignedLeaf(signedLeaf) {
  try {
    return await ddbClient.send(new QueryCommand({
      TableName: LeavesTableName,
      IndexName: "SignedLeavesIndex",
      KeyConditionExpression: "SignedLeaf = :signedLeaf",
      ExpressionAttributeValues: {
        ":signedLeaf": {
          S: signedLeaf
        }
      }
    }));
  } catch (err) {
    await handleDynamoDbErrorNotification(err);
    console.error("getLeavesBySignedLeaf: ", err);
    // Throw error to display on frontend
    throw new Error("An error occurred while querying the database");
  }
}

module.exports = {
  LeavesTableName,
  ddbClient,
  createLeavesTableIfNotExists,
  putLeaf,
  getLeafAtIndex,
  getLeavesBySignedLeaf,
};
