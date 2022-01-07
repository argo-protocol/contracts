import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { MarketFactory } from "../typechain";
import { ethers } from "hardhat";
import chai, { expect } from "chai";
import { smock } from "@defi-wonderland/smock";

chai.use(smock.matchers);

const x0 = "0x".padEnd(42, "0");

describe("MarketFactory", () => {
  let owner: SignerWithAddress;
  let factory: MarketFactory;

  beforeEach(async () => {
    [owner] = await ethers.getSigners();
    factory = await (await ethers.getContractFactory("MarketFactory"))
      .connect(owner)
      .deploy();
  });

  describe("createMarket", () => {
    it("creates initialized market and emits event", async () => {
      for (let i = 0; i < 3; i++) {
        const ltv = 1 + i;
        await expect(factory.createMarket(x0, x0, x0, x0, ltv, 2, 3))
          .to.emit(factory, "CreateMarket")
          .withArgs(i);
        const marketAddr = await factory.markets(i);
        const market = await ethers.getContractAt(
          "ZeroInterestMarket",
          marketAddr
        );
        expect(await market.maxLoanToValue()).to.eq(ltv);
      }
    });
  });
});
