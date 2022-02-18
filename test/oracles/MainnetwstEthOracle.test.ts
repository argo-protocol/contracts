import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { MainnetwstETH, MainnetwstETH__factory, IOracle } from "../../typechain";
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

describe("MainnetwstEthOracle", () => {
    let owner: SignerWithAddress;
    let oracle: IOracle;

    describe("fetchPrice", () => {
        before(async () => {
            await fork_network();

            const WST_ETH_ADDRESS = "0x7f39c581f595b53c5cb19bd0b3f8da6c935e2ca0";
            const STETH_USD_ADDRESS = "0xCfE54B5cD566aB89272946F602D76Ea879CAb4a8";

            [owner] = await ethers.getSigners();

            oracle = await new MainnetwstETH__factory(owner).deploy(
                WST_ETH_ADDRESS,
                STETH_USD_ADDRESS
            );
        });

        after(async () => {
            await fork_reset();
        });

        it("can fetch the current price", async () => {
            
            let [success, price] = await oracle.fetchPrice();
            expect(success).to.be.true;
            //on jan 6 at 1800 PST (time of the block at 13955627)
            //approx numbers could be off +- 100, looking at graph from coingecko without
            //steth ~= 3374        
            expect(price).to.equal("3197496623660331580335")
        });
    });
});