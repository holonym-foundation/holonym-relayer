const { expect } = require('chai');
const { exec } = require('child_process');

describe("Local smart contracts are the same as most recent contracts at https://github.com/holonym-foundation/id-hub-contracts", function(){
    before(function(done){
        exec('./diffRemoteContracts').on('exit', exitCode => {
            if (exitCode === 1) {
              done(new Error('local dir ./contracts differs from https://github.com/holonym-foundation/id-hub-contracts/tree/main/contracts'));
            } else {
                done();
            }
        });
    }); 

    it("Add the repo and diff contracts against it", function() {
        // This is intentionally blank. It needs to exist, so the errors in the before() are caught
    })
})
