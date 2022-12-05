
# How to use relayer
`RELAYER_URL` is https://relayer.holonym.id

`issuer` is the address of the credential issuer

`v`, `r`, and `s` constitute the issuer's ECDSA signature of the old leaf

`zkp` is the ZoKrates-generated JSON object of the proof. However, it's just the proof object of a, b, and c without public inputs.

`zkpInputs` are the inputs part of the of the ZoKrates-generated proof

```
const axios = require("axios");
const res = await axios.post(`${RELAYER_URL}/addLeaf`, {
            addLeafArgs: {
                issuer : ISSUER_ADDRESS, 
                v : SIGV, 
                r : SIGR, 
                s : SIGS, 
                zkp : ZKP, 
                zkpInputs : ZKPINPUTS
            }
            });
```

# Testing
A local hardhat environment is used for testing. All of the smart contracts in contracts/ are used here solely for testing purposes. Call `npx hardhat test` to test