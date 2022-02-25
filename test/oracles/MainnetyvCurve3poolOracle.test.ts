import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { MainnetyvCurve3pool, MainnetyvCurve3pool__factory, IOracle } from "../../typechain";
import { ethers, network } from "hardhat";
import chai, { expect } from "chai";
import { FakeContract, smock } from "@defi-wonderland/smock";

chai.use(smock.matchers);


async function fork_network(blockNumber = 14271659) {
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

describe("MainnetyvCurve3pool oracle", () => {
    let owner: SignerWithAddress;
    let oracle: IOracle;

    describe("fetchPrice", () => {
        before(async () => {
            await fork_network();
            const YEARN_VAULT = "0x84E13785B5a27879921D6F685f041421C7F482dA";
            const THREE_CRV_ADDRESS = "0xbEbc44782C7dB0a1A60Cb6fe97d0b483032FF1C7";
            const DAI_ADDRESS = "0xAed0c38402a5d19df6E4c03F4E2DceD6e29c1ee9";
            const USDC_ADDRESS = "0x8fFfFfd4AfB6115b954Bd326cbe7B4BA576818f6";
            const USDT_ADDRESS = "0x3E7d1eAB13ad0104d2750B8863b489D65364e32D";

            [owner] = await ethers.getSigners();

            oracle = await new MainnetyvCurve3pool__factory(owner).deploy(
                YEARN_VAULT,
                THREE_CRV_ADDRESS,
                DAI_ADDRESS,
                USDC_ADDRESS,
                USDT_ADDRESS
            );
        });

        after(async () => {
            await fork_reset();
        });

        it("can fetch the current price", async () => {
            
            let [success, price] = await oracle.fetchPrice();
            expect(success).to.be.true;            
            expect(price).to.equal("1055802361876678856")
        });
    });
});