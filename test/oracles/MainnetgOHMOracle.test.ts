import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { MainnetgOHMOracle, MainnetgOHMOracle__factory } from "../../typechain";
import { ethers } from "hardhat";
import { expect } from "chai";
import { forkNetwork, forkReset, impersonate } from "../utils/vm";

const E18 = '000000000000000000'; // 18 zeros

describe("MainnetgOHMOracle", () => {
    let owner: SignerWithAddress;
    let oracle: MainnetgOHMOracle;

    describe("fetchPrice", () => {
        before(async () => {
            await forkNetwork();
            const GOHM_ADDRESS = "0x0ab87046fBb341D058F17CBC4c1133F25a20a52f";
            // NB: this is the v1 OHM address
            const OHM_ETH_ADDRESS = "0x90c2098473852e2f07678fe1b6d595b1bd9b16ed";
            const  ETH_USD_ADDRESS = "0x5f4ec3df9cbd43714fe2740f5e3616155c5b8419";

            [owner] = await ethers.getSigners();
            oracle = await new MainnetgOHMOracle__factory(owner).deploy(
                GOHM_ADDRESS,
                OHM_ETH_ADDRESS,
                ETH_USD_ADDRESS,
            );
        });

        after(async () => {
            await forkReset();
        });

        it("can fetch the current price", async () => {
            let [success, price] = await oracle.fetchPrice();
            expect(success).to.be.true;
            // $23,130.06
            expect(price).to.equal("23130639289317677272023");
        });
    });
});