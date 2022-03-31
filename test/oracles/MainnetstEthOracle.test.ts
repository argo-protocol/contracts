import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { MainnetChainlinkOracle, MainnetChainlinkOracle__factory, IOracle } from "../../typechain";
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

describe("MainnetstEthOracle", () => {
    let owner: SignerWithAddress;
    let oracle: IOracle;

    describe("fetchPrice", () => {
        before(async () => {
            await fork_network();

            const STETH_USD_ADDRESS = "0xCfE54B5cD566aB89272946F602D76Ea879CAb4a8";

            [owner] = await ethers.getSigners();

            oracle = await new MainnetChainlinkOracle__factory(owner).deploy(STETH_USD_ADDRESS);
        });

        after(async () => {
            await fork_reset();
        });

        it("can fetch the current price", async () => {
            let [success, price] = await oracle.fetchPrice();
            expect(success).to.be.true;
            //on jan 6 at 1800 PST (time of the block at 13955627)
            //eth ~= 3392
            //steth ~= 3374 (from coingecko)
            expect(price).to.equal("3375053672360000000000");
        });
    });
});
