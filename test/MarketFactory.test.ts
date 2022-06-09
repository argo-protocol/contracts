import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { IDebtToken, IERC20, IERC20Metadata, MarketFactory } from "../typechain";
import { ethers } from "hardhat";
import { expect } from "chai";
import { FakeContract, smock } from "@defi-wonderland/smock";

const x0 = "0x".padEnd(42, "0");

describe("MarketFactory", () => {
    let deployer: SignerWithAddress;
    let marketFactory: MarketFactory;

    beforeEach(async () => {
        [deployer] = await ethers.getSigners();
        marketFactory = await (await ethers.getContractFactory("MarketFactory")).connect(deployer).deploy();
    });

    describe("createZeroInterestMarket", () => {
        it("creates initialized market and emits CreateMarket event", async () => {
            for (let i = 0; i < 3; i++) {
                const owner = ethers.Wallet.createRandom().address;
                const treasury = ethers.Wallet.createRandom().address;
                const collateralToken = ethers.Wallet.createRandom().address;
                const debtToken = ethers.Wallet.createRandom().address;
                const oracle = ethers.Wallet.createRandom().address;
                const ltv = 1 + i;
                const borrowRate = 1 + i;
                const liquidationPenalty = 1 + i;

                const result = await marketFactory.createZeroInterestMarket(
                    owner,
                    treasury,
                    collateralToken,
                    debtToken,
                    oracle,
                    ltv,
                    borrowRate,
                    liquidationPenalty
                );

                expect(result).to.emit(marketFactory, "CreateMarket");

                const marketAddr = (
                    await marketFactory.queryFilter(
                        marketFactory.filters.CreateMarket(debtToken, collateralToken),
                        result.blockHash
                    )
                )[0].args.market;

                const market = await ethers.getContractAt("ZeroInterestMarket", marketAddr);

                expect(await market.owner()).to.eq(owner);
                expect(await market.treasury()).to.eq(treasury);
                expect(await market.collateralToken()).to.eq(collateralToken);
                expect(await market.debtToken()).to.eq(debtToken);
                expect(await market.oracle()).to.eq(oracle);
                expect(await market.maxLoanToValue()).to.eq(ltv);
                expect(await market.borrowRate()).to.eq(borrowRate);
                expect(await market.liquidationPenalty()).to.eq(liquidationPenalty);
            }
        });
    });

    describe("createPegStabilityModule", () => {
        let owner: string;
        let treasury: string;
        let debtToken: FakeContract<IERC20Metadata>;
        let reserveToken: FakeContract<IERC20Metadata>;

        beforeEach(async () => {
            owner = ethers.Wallet.createRandom().address;
            treasury = ethers.Wallet.createRandom().address;

            debtToken = await smock.fake<IERC20Metadata>("IERC20Metadata");
            debtToken.decimals.returns(18);

            reserveToken = await smock.fake<IERC20Metadata>("IERC20Metadata");
            reserveToken.decimals.returns(6);
        });

        it("creates initialized PSM and emits CreatePSM event", async () => {
            for (let i = 0; i < 3; i++) {
                const buyFee = 1 + i;
                const sellFee = 1 + i;

                const result = await marketFactory.createPegStabilityModule(
                    owner,
                    debtToken.address,
                    reserveToken.address,
                    buyFee,
                    sellFee,
                    treasury
                );

                expect(result).to.emit(marketFactory, "CreatePSM");

                const psmAddr = (
                    await marketFactory.queryFilter(
                        marketFactory.filters.CreatePSM(debtToken.address, reserveToken.address),
                        result.blockHash
                    )
                )[0].args.psm;

                const psm = await ethers.getContractAt("PegStability", psmAddr);

                expect(await psm.owner()).to.eq(owner);
                expect(await psm.treasury()).to.eq(treasury);
                expect(await psm.debtToken()).to.eq(debtToken.address);
                expect(await psm.reserveToken()).to.eq(reserveToken.address);
                expect(await psm.buyFee()).to.eq(buyFee);
                expect(await psm.sellFee()).to.eq(sellFee);
            }
        });

        it("reverts on zero debt token address", async () => {
            await expect(
                marketFactory.createPegStabilityModule(
                    owner,
                    ethers.constants.AddressZero,
                    reserveToken.address,
                    250, // 0.25%
                    450, // 0.45%
                    treasury
                )
            ).to.be.revertedWith("0x0 debt token");
        });

        it("reverts on zero reserve token address", async () => {
            await expect(
                marketFactory.createPegStabilityModule(
                    owner,
                    debtToken.address,
                    ethers.constants.AddressZero,
                    250, // 0.25%
                    450, // 0.45%
                    treasury
                )
            ).to.be.revertedWith("0x0 reserve token");
        });

        it("reverts on zero treasury address", async () => {
            await expect(
                marketFactory.createPegStabilityModule(
                    owner,
                    debtToken.address,
                    reserveToken.address,
                    250, // 0.25%
                    450, // 0.45%
                    ethers.constants.AddressZero
                )
            ).to.be.revertedWith("0x0 treasury");
        });
    });

    describe("createToken", () => {
        let owner: string;
        let treasury: string;

        beforeEach(async () => {
            owner = ethers.Wallet.createRandom().address;
            treasury = ethers.Wallet.createRandom().address;
        });

        it("creates initialized token and emits CreateToken event", async () => {
            for (let i = 0; i < 3; i++) {
                const result = await marketFactory.createToken(owner, treasury, "A Stable", "FOO");

                expect(result).to.emit(marketFactory, "CreateToken");

                const tokenAddr = (
                    await marketFactory.queryFilter(marketFactory.filters.CreateToken(), result.blockHash)
                )[0].args.token;

                const token = await ethers.getContractAt("DebtToken", tokenAddr);

                expect(await token.owner()).to.eq(owner);
                expect(await token.treasury()).to.eq(treasury);
                expect(await token.name()).to.eq("A Stable");
                expect(await token.symbol()).to.eq("FOO");
            }
        });

        it("reverts on zero owner address", async () => {
            await expect(
                marketFactory.createToken(ethers.constants.AddressZero, treasury, "A Stable", "FOO")
            ).to.be.revertedWith("0x0 owner");
        });

        it("reverts on zero treasury address", async () => {
            await expect(
                marketFactory.createToken(owner, ethers.constants.AddressZero, "A Stable", "FOO")
            ).to.be.revertedWith("0x0 treasury");
        });
    });
});
