use std::env;

use tokio::time::{interval, Duration};
use serde::{Serialize, Deserialize};
use dotenv::dotenv;

#[derive(Serialize, Deserialize, Debug)]
struct MerkleTree {
    _depth: u8,
    _arity: u8,
    _zeroes: Vec<String>,
    _nodes: Vec<Vec<String>>,
    _root: String,
}

#[derive(Serialize, Deserialize, Debug)]
struct FinalizeTreeResponse {
    success: bool
}

/// Tell the relayer to write the merkle tree to a file.
async fn trigger_merkle_tree_finalization() {
    let environment = env::var("ENVIRONMENT").expect("ENVIRONMENT must be set");
    
    let relayer_url = if environment == "development" {
        "http://localhost:6969"
    } else {
        "https://relayer.holonym-internal.net"
    };
    let url = relayer_url.to_owned() + "/v3/finalize-pending-tree";

    let relayer_api_key = env::var("RELAYER_ADMIN_API_KEY").expect("RELAYER_ADMIN_API_KEY must be set");

    let client = reqwest::Client::new();
    let req_result = client.post(url).header("x-api-key", relayer_api_key).send().await;

    match req_result {
        Ok(resp) => {
            let status = resp.status();
            let json_result = resp.json::<FinalizeTreeResponse>().await;

            match json_result {
                Ok(json) => {
                    if status != 200 {
                        println!("Error triggering merkle tree finalization. response status: {:?}. response: {:?}", status, json);
                    } else {
                        println!("Successfully triggered merkle tree finalization. response status: {:?}. response: {:?}", status, json);
                    }
                },
                Err(e) => println!("Error parsing response json: {:?}", e),
            }
        },
        Err(e) => println!("Error triggering merkle tree write: {:?}", e),
    }

}

#[tokio::main]
async fn main() {
    dotenv().ok();

    env::var("RELAYER_ADMIN_API_KEY").expect("RELAYER_ADMIN_API_KEY must be set");
    env::var("ENVIRONMENT").expect("ENVIRONMENT must be set");

    let mut interval = interval(Duration::from_secs(5));
    loop {
        interval.tick().await;
        trigger_merkle_tree_finalization().await;
    }
}
