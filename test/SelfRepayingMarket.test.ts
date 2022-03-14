import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import {
    IDebtToken,
    IERC20,
    IOracle,
    IFlashSwap,
    SelfRepayingMarket,
    SelfRepayingMarket__factory,
    ERC20Mock,
    ERC20Mock__factory,
    DebtToken,
    DebtToken__factory,
    ERC4626Mock,
    ERC4626Mock__factory,
    StubOracle,
    StubOracle__factory,
} from "../typechain";
import { ethers } from "hardhat";
import chai, { expect } from "chai";
import { FakeContract, smock } from "@defi-wonderland/smock";
import { BigNumber } from "ethers";

const e18 = "0".repeat(18);

describe("SelfRepayingMarket", () => {
    let owner: SignerWithAddress;
    let treasury: SignerWithAddress;
    let borrower: SignerWithAddress;
    let other: SignerWithAddress;
    let collateralToken: ERC20Mock;
    let vaultToken: ERC4626Mock;
    let debtToken: DebtToken;
    let oracle: StubOracle;
    let market: SelfRepayingMarket;

    beforeEach(async () => {
        [owner, treasury, borrower, other] = await ethers.getSigners();
        collateralToken = await new ERC20Mock__factory(owner).deploy(
            "Mock Collateral",
            "MOCK",
            borrower.address,
            `10000${e18}`,
        );
        vaultToken = await new ERC4626Mock__factory(owner).deploy(
            "Mock Vault",
            "vMOCK",
            collateralToken.address,
        );
        debtToken = await new DebtToken__factory(owner).deploy(treasury.address);
        oracle = await new StubOracle__factory(owner).deploy();
        market = await new SelfRepayingMarket__factory(owner).deploy();
    });

    describe("initialize", () => {
        it("can initialize correctly", async () => {
            await market.initialize(
                owner.address,
                treasury.address,
                collateralToken.address,
                vaultToken.address,
                debtToken.address,
                oracle.address,
                6000,
                100,
                500,
                1500
            );

            expect(await market.owner()).to.equal(owner.address);
            expect(await market.treasury()).to.equal(treasury.address);
            expect(await market.collateralToken()).to.equal(collateralToken.address);
            expect(await market.vaultToken()).to.equal(vaultToken.address);
            expect(await market.debtToken()).to.equal(debtToken.address);
            expect(await market.oracle()).to.equal(oracle.address);
            expect(await market.maxLoanToValue()).to.equal(6000);
            expect(await market.borrowRate()).to.equal(100);
            expect(await market.yieldRate()).to.equal(500);
            expect(await market.liquidationPenalty()).to.equal(1500);
        });

        it("cannot be initialized again", async () => {
            await market.initialize(
                owner.address,
                treasury.address,
                collateralToken.address,
                vaultToken.address,
                debtToken.address,
                oracle.address,
                6000,
                100,
                500,
                1500
            );
            
            await expect(market.initialize(
                owner.address,
                treasury.address,
                collateralToken.address,
                vaultToken.address,
                debtToken.address,
                oracle.address,
                6000,
                100,
                500,
                1500
            )).to.be.revertedWith("Initializable: contract is already initialized");
        })
    });

    context("post-initialization", () => {
        beforeEach(async () => {
            await market.initialize(
                owner.address,
                treasury.address,
                collateralToken.address,
                vaultToken.address,
                debtToken.address,
                oracle.address,
                60000, // 60%
                1000, // 1%
                5000, // 5%
                15000, // 15%
            );
        });

        describe("deposit", () => {
            it("transfers collateral from borrower", async () => {
                const AMOUNT = `100${e18}`;
                const PREV_HOLDING = await collateralToken.balanceOf(borrower.address);

                await collateralToken.connect(borrower).approve(market.address, AMOUNT);
                await market.connect(borrower).deposit(borrower.address, AMOUNT);

                expect(await collateralToken.balanceOf(borrower.address)).to.equal(BigNumber.from(PREV_HOLDING).sub(BigNumber.from(AMOUNT)));
            });

            it("updates bookkeeping and emits event", async () => {
                const AMOUNT = `100${e18}`;
                await collateralToken.connect(borrower).approve(market.address, AMOUNT);

                await expect(market.connect(borrower).deposit(borrower.address, AMOUNT))
                    .to.emit(market, "Deposit").withArgs(borrower.address, borrower.address, AMOUNT);

                expect(await market.totalCollateral()).to.equal(AMOUNT);
                expect(await market.userCollateral(borrower.address)).to.equal(AMOUNT);
            });
            
            it("deposits collateral into vault", async () => {
                const AMOUNT = `100${e18}`;
                await collateralToken.connect(borrower).approve(market.address, AMOUNT);

                await market.connect(borrower).deposit(borrower.address, AMOUNT);

                expect(await collateralToken.balanceOf(vaultToken.address)).to.equal(AMOUNT);
            });

            it("can deposit on behalf of another account");
            it("reverts when amount is 0");
            it("tracks shares of vault tokens");
        });

        describe("withdraw", () => {
            const AMOUNT = `100${e18}`;

            beforeEach(async () => {
                await collateralToken.connect(borrower).approve(market.address, AMOUNT);
                await market.connect(borrower).deposit(borrower.address, AMOUNT);
            });

            it("transfers collateral tokens back to borrower", async () => {
                const PREV_HOLDING = await collateralToken.balanceOf(borrower.address);
                await market.connect(borrower).withdraw(borrower.address, AMOUNT);
                expect(await collateralToken.balanceOf(borrower.address)).to.equal(BigNumber.from(PREV_HOLDING).add(BigNumber.from(AMOUNT)));
            });

            it("does bookkeeping and emits event", async () => {
                await expect(market.connect(borrower).withdraw(borrower.address, AMOUNT))
                    .to.emit(market, "Withdraw").withArgs(borrower.address, borrower.address, AMOUNT);

                expect(await market.totalCollateral()).to.equal(0);
                expect(await market.userCollateral(borrower.address)).to.equal(0);
            });

            it("can send tokens to another account");
            it("reverts when LTV is too low");
            it("reverts when amount is 0");
            it("updates price");
        });

        describe("borrow", () => {
            const AMOUNT = `100${e18}`;

            beforeEach(async () => {
                await debtToken.mint(market.address, `10000${e18}`);
                await collateralToken.connect(borrower).approve(market.address, AMOUNT);
                await market.connect(borrower).deposit(borrower.address, AMOUNT);
            });

            it("transfers debt token to the borrower", async () => {
                const BORROW_AMOUNT = `80${e18}`
                const MARKET_BEFORE = await debtToken.balanceOf(market.address);
                expect(await debtToken.balanceOf(borrower.address)).to.equal(0);

                await market.connect(borrower).borrow(borrower.address, BORROW_AMOUNT);

                expect(await debtToken.balanceOf(borrower.address)).to.equal(BORROW_AMOUNT);
                expect(await debtToken.balanceOf(market.address)).to.equal(BigNumber.from(MARKET_BEFORE).sub(BigNumber.from(BORROW_AMOUNT)));
            });

            it("assesses borrow fee", async () => {
                const BORROW_AMOUNT = `80${e18}`
                const FEE = `80${'0'.repeat(16)}`;
                const MARKET_BEFORE = await debtToken.balanceOf(market.address);
                expect(await debtToken.balanceOf(borrower.address)).to.equal(0);

                await market.connect(borrower).borrow(borrower.address, BORROW_AMOUNT);

                expect(await market.feesCollected()).to.equal(FEE);
            });

            it("does bookkeeping and emits event", async () => {
                const BORROW_AMOUNT = `80${e18}`
                const AMOUNT_PLUS_FEE = `8080${'0'.repeat(16)}`;
                await expect(market.connect(borrower).borrow(borrower.address, BORROW_AMOUNT))
                    .to.emit(market, "Borrow").withArgs(borrower.address, borrower.address, AMOUNT_PLUS_FEE);
                
                expect(await market.totalDebt()).to.equal(AMOUNT_PLUS_FEE);
                expect(await market.userDebt(borrower.address)).to.equal(AMOUNT_PLUS_FEE);
            });

            it("requires amount > 0");
            it("enforces LTV");
            it("updates price");
        });

        describe("harvest", () => {
            const AMOUNT = `100${e18}`;

            beforeEach(async () => {
                await collateralToken.connect(borrower).approve(market.address, AMOUNT);
                await market.connect(borrower).deposit(borrower.address, AMOUNT);
            });

            it("withdraws and swaps tokens to debt token", async () => {
                /// cause some yield to happen
                await collateralToken.mint(vaultToken.address, `10${e18}`);
                expect(await collateralToken.balanceOf(vaultToken.address)).to.equal(`110${e18}`);

                await market.harvest();

                expect(await collateralToken.balanceOf(vaultToken.address)).to.equal(`100${e18}`);
            });
        });
    });
});