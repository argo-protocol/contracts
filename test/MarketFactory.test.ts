import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { MarketFactory } from "../typechain";
import { ethers } from "hardhat";
import  { expect } from "chai";

const x0 = "0x".padEnd(42, "0");

describe.only("MarketFactory", () => {
    let deployer: SignerWithAddress;
    let owner: SignerWithAddress;
    let other: SignerWithAddress;
    let marketFactory: MarketFactory;

    beforeEach(async () => {
        [deployer, owner, other] = await ethers.getSigners();
        marketFactory = await (await ethers.getContractFactory("MarketFactory"))
            .connect(deployer)
            .deploy(owner.address);
    });

    it("transfers ownership on construction", async () => {
        expect(await marketFactory.owner()).to.eq(owner.address);
    });

    describe("createZeroInterestMarket", () => {
        it("reverts if signer is non-owner", async () => {
            await expect(marketFactory.connect(other).createZeroInterestMarket(x0, x0, x0, x0, 1, 2, 3)).to.be.reverted;
        });

        it("creates initialized market and emits event", async () => {
            for (let i = 0; i < 3; i++) {
                const ltv = 1 + i;
                await expect(marketFactory.connect(owner).createZeroInterestMarket(x0, x0, x0, x0, ltv, 2, 3))
                    .to.emit(marketFactory, "CreateMarket")
                    .withArgs(i);
                expect(await marketFactory.numMarkets()).to.eq(i+1);
                const marketAddr = await marketFactory.markets(i);
                const market = await ethers.getContractAt("ZeroInterestMarket", marketAddr);
                expect(await market.maxLoanToValue()).to.eq(ltv);
            }
        });
        it("transfers ownership to marketFactory owner", async () => {
            marketFactory.connect(owner).createZeroInterestMarket(x0, x0, x0, x0, 1, 2, 3);
            const marketAddr = await marketFactory.markets(0);
            const market = await ethers.getContractAt("ZeroInterestMarket", marketAddr);
            expect(await market.owner()).to.eq(owner.address);
        });
    });
});
