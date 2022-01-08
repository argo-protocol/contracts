import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { MarketFactory } from "../typechain";
import { ethers } from "hardhat";
import chai, { expect } from "chai";
import { smock } from "@defi-wonderland/smock";

chai.use(smock.matchers);

const x0 = "0x".padEnd(42, "0");

describe.only("MarketFactory", () => {
    let deployer: SignerWithAddress;
    let owner: SignerWithAddress;
    let other: SignerWithAddress;
    let factory: MarketFactory;

    beforeEach(async () => {
        [deployer, owner, other] = await ethers.getSigners();
        factory = await (await ethers.getContractFactory("MarketFactory")).connect(deployer).deploy(owner.address);
    });

    it("transfers ownership on construction", async () => {
        expect(await factory.owner()).to.eq(owner.address);
    });

    describe("createMarket", () => {
        it("reverts if signer is non-owner", async () => {
            await expect(factory.connect(other).createMarket(x0, x0, x0, x0, 1, 2, 3)).to.be.reverted;
        });

        it("creates initialized market and emits event", async () => {
            for (let i = 0; i < 3; i++) {
                const ltv = 1 + i;
                await expect(factory.connect(owner).createMarket(x0, x0, x0, x0, ltv, 2, 3))
                    .to.emit(factory, "CreateMarket")
                    .withArgs(i);
                const marketAddr = await factory.markets(i);
                const market = await ethers.getContractAt("ZeroInterestMarket", marketAddr);
                expect(await market.maxLoanToValue()).to.eq(ltv);
            }
        });
    });
});
