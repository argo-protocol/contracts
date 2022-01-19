import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { MainnetwxBTRFLYOracle, MainnetwxBTRFLYOracle__factory, UniswapPairOracle, UniswapPairOracle__factory } from "../../typechain";
import { ethers, network } from "hardhat";
import chai, { expect } from "chai";
import { FakeContract, smock } from "@defi-wonderland/smock";

chai.use(smock.matchers);


async function fork_network(blockNumber = 13955627) {
    /// Use mainnet fork as provider
    return network.provider.request({
        method: "hardhat_reset",
        params: [
            {
                forking: {
                    jsonRpcUrl: `https://eth-mainnet.alchemyapi.io/v2/${process.env.ALCHEMY_API_KEY}`,
                    blockNumber: blockNumber,
                },
            },
        ],
    });
}

async function fork_reset() {
    return await network.provider.request({
        method: "hardhat_reset",
        params: [],
    });
}

const E18 = '000000000000000000'; // 18 zeros

describe("MainnetwxBTRFLYOracle", () => {
    let owner: SignerWithAddress;
    let oracle: MainnetwxBTRFLYOracle;
    let uniswapOracle: UniswapPairOracle;

    describe("fetchPrice", () => {
        before(async () => {
            await fork_network();
            // OLD contract
            const wxBTRFLY_ADDRESS = "0x186E55C0BebD2f69348d94C4A27556d93C5Bd36C";
            const SUSHISWAP_FACTORY = "0xc0aee478e3658e2610c5f7a4a2e1777ce9e4f2ac"; //Found by going to sushiswap pair BTRFLY/OHM contract's 'factory' field: https://etherscan.io/token/0xe9AB8038Ee6Dd4fCC7612997FE28d4e22019C4B4#readContract
            const BTRFLY_ADDRESS = "0xc0d4ceb216b3ba9c3701b291766fdcba977cec3a"; 
            const OHM_ADDRESS = "0x64aa3364f17a4d01c6f1751fd97c2bd3d7e7f1d5";  //v2 OHM
            // NB: this is the v1 OHM address
            const OHM_ETH_ADDRESS = "0x90c2098473852e2f07678fe1b6d595b1bd9b16ed";
            const ETH_USD_ADDRESS = "0x5f4ec3df9cbd43714fe2740f5e3616155c5b8419";

            [owner] = await ethers.getSigners();

            uniswapOracle = await new UniswapPairOracle__factory(owner).deploy(
                SUSHISWAP_FACTORY,                
                BTRFLY_ADDRESS,
                OHM_ADDRESS,
                owner.address
            );
            uniswapOracle.setPeriod(100);

            oracle = await new MainnetwxBTRFLYOracle__factory(owner).deploy(
                wxBTRFLY_ADDRESS,
                OHM_ADDRESS,
                BTRFLY_ADDRESS,
                uniswapOracle.address,
                OHM_ETH_ADDRESS,
                ETH_USD_ADDRESS,
            );
        });

        after(async () => {
            await fork_reset();
        });

        it("can fetch the current price", async () => {            
            await oracle.update();
            let [success, price] = await oracle.fetchPrice();
            expect(success).to.be.true;
            // $23,130.06
            expect(price).to.equal("3200");
        });
    });
});