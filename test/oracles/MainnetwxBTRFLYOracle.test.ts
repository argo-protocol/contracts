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

            const wxBTRFLY_ADDRESS = "0x186E55C0BebD2f69348d94C4A27556d93C5Bd36C"; // OLD contract.  new one is 0x4b16d95ddf1ae4fe8227ed7b7e80cf13275e61c9
            const SUSHISWAP_FACTORY = "0xc0aee478e3658e2610c5f7a4a2e1777ce9e4f2ac"; //Found by going to sushiswap pair BTRFLY/OHM contract's 'factory' field: https://etherscan.io/token/0xe9AB8038Ee6Dd4fCC7612997FE28d4e22019C4B4#readContract
            const BTRFLY_ADDRESS = "0xc0d4ceb216b3ba9c3701b291766fdcba977cec3a";
            const OHM_ADDRESS = "0x64aa3364f17a4d01c6f1751fd97c2bd3d7e7f1d5";  //v2 OHM            
            const OHM_ETH_ADDRESS = "0x9a72298ae3886221820b1c878d12d872087d3a23"; //v2 OHM
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
            //on jan 6 at 1800 PST (time of the block at 13955627)
            //ohmv2 ~=300
            //btrfly ~= 3180
            //eth ~= 3392
            //so 1 ohm = 0.094339622641509 btrfly
            //so btrflyUsdPrice = 3245274464515 / 1e9 = 3245.274464515
                                    
            expect(price).to.equal("2146454690831646759477");
        });
    });
});