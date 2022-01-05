import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import {IERC20, IOracle, ZeroInterestMarket, ZeroInterestMarket__factory} from "../typechain";
import { ethers } from "hardhat";
import chai, { expect } from "chai";
import { FakeContract, smock } from "@defi-wonderland/smock";

chai.use(smock.matchers);

const E18 = '000000000000000000'; // 18 zeros

describe("ZeroInterestMarket", () => {
    let owner: SignerWithAddress;
    let borrower: SignerWithAddress;
    let treasury: SignerWithAddress;
    let liquidator: SignerWithAddress;
    let debtToken: FakeContract<IERC20>;
    let collateralToken: FakeContract<IERC20>;
    let oracle: FakeContract<IOracle>;
    let market: ZeroInterestMarket;

    context("post-construction", () => {
        beforeEach(async () => {
            [owner, treasury, borrower, liquidator] = await ethers.getSigners();
            debtToken = await smock.fake<IERC20>("IERC20");
            collateralToken = await smock.fake<IERC20>("IERC20");
            oracle = await smock.fake<IOracle>("IOracle");
            market = await new ZeroInterestMarket__factory(owner).deploy(
                treasury.address,
                collateralToken.address,
                debtToken.address,
                oracle.address,
                60000, // loan-to-value (60%)
                1500, // borrow rate (1.5%) 
                10000, // liquidation penalty (10%)
            );
        });

        describe("deposit", () => {
            it("withdraws funds from depositor", async () => {
                const AMOUNT = 100000;
                collateralToken.transferFrom.returns(true);
                await market.connect(borrower).deposit(AMOUNT);

                expect(collateralToken.transferFrom).to.be.calledWith(borrower.address, market.address, AMOUNT);
            });

            it("updates bookkeeping", async () => {
                const AMOUNT = 100000;
                collateralToken.transferFrom.returns(true);
                await market.connect(borrower).deposit(AMOUNT);

                expect(await market.totalCollateral()).to.equal(AMOUNT);
                expect(await market.userCollateral(borrower.address)).to.equal(AMOUNT);
            });
        });

        describe("borrow", () => {
            beforeEach(async () => {
                // user has deposited $1000 worth of collateral
                const COLL_AMOUNT = `10${E18}`;
                const COLL_VALUE = `100${E18}`;

                collateralToken.transferFrom.returns(true);
                oracle.fetchPrice.returns(COLL_VALUE);

                await market.connect(borrower).deposit(COLL_AMOUNT);
            });

            it("transfers the borrowed token to the borrower", async () => {
                const BORROW_AMOUNT = `10${E18}`;
                debtToken.transfer.returns(true);
                await market.connect(borrower).borrow(BORROW_AMOUNT);
                expect(debtToken.transfer).to.be.calledWith(borrower.address, BORROW_AMOUNT);
            });

            it("transfers the fee amount to the treasury", async () => {
                const BORROW_AMOUNT = `10${E18}`;
                const FEE_AMOUNT = '150000000000000000'; // $0.15
                debtToken.transfer.returns(true);
                await market.connect(borrower).borrow(BORROW_AMOUNT);
                expect(debtToken.transfer).to.be.calledWith(treasury.address, FEE_AMOUNT);
            });

            it("sets user's total debt to borrowed + fee", async () => {
                const BORROW_AMOUNT = `10${E18}`;
                const TOTAL_DEBT = '10150000000000000000'; // $10.15
                debtToken.transfer.returns(true);
                await market.connect(borrower).borrow(BORROW_AMOUNT);
                expect(await market.userDebt(borrower.address)).to.equal(TOTAL_DEBT);
                expect(await market.totalDebt()).to.equal(TOTAL_DEBT);
                expect(await market.getUserLTV(borrower.address)).to.equal("1015");
            });

            it("allows up to LTV limit for those that live dangerously", async () => {
                // this is an LTV of exactly 60%
                const BORROW_AMOUNT = `591140000000000000000`;
                debtToken.transfer.returns(true);
                await market.connect(borrower).borrow(BORROW_AMOUNT);
                expect(await market.getUserLTV(borrower.address)).to.equal("60000");
            });

            it("reverts if LTV is too high", async () => {
                const BORROW_AMOUNT = `1000${E18}`;
                debtToken.transfer.returns(true);
                await expect(market.connect(borrower).borrow(BORROW_AMOUNT))
                    .to.be.revertedWith("Market: exceeds Loan-to-Value");
            });

            it("reverts on LTV is too high bounds", async () => {
                // this is an LTV of exactly 60.001%
                const BORROW_AMOUNT = `591150000000000000000`;
                debtToken.transfer.returns(true);
                await expect(market.connect(borrower).borrow(BORROW_AMOUNT))
                    .to.be.revertedWith("Market: exceeds Loan-to-Value");
            });
        });

        describe("withdraw", () => {
            const BORROW_AMOUNT = `500${E18}`;
            const DEBT_AMOUNT = `507500000000000000000`; // $507.50
            // user has deposited $1000 worth of collateral
            const COLL_AMOUNT = `10${E18}`;
            const COLL_VALUE = `100${E18}`;

            beforeEach(async () => {
                collateralToken.transferFrom.returns(true);
                collateralToken.transfer.returns(true);
                debtToken.transferFrom.returns(true);
                debtToken.transfer.returns(true);
                oracle.fetchPrice.returns(COLL_VALUE);

                await market.connect(borrower).deposit(COLL_AMOUNT);
                await market.connect(borrower).borrow(BORROW_AMOUNT);

                expect(await market.userDebt(borrower.address)).to.equal(DEBT_AMOUNT);
            });

            it("removes collateral", async () => {
                await market.connect(borrower).withdraw(`1${E18}`);

                expect(await market.userCollateral(borrower.address)).to.equal(`9${E18}`);
                expect(await market.totalCollateral()).to.equal(`9${E18}`);
            });

            it("reverts if reducing LTV below limit", async () => {
                await expect(market.connect(borrower).withdraw(`9${E18}`))
                    .to.be.revertedWith("Market: exceeds Loan-to-Value");
            });

            it("bounds check on LTV", async () => {
                await market.connect(borrower).withdraw(`1541800000000000000`);
                expect(await market.getUserLTV(borrower.address)).to.equal("60000");
            });

            it("reverts if LTV is exceeded (bounds check)", async () => {
                await expect(market.connect(borrower).withdraw(`1541900000000000000`))
                    .to.be.revertedWith("Market: exceeds Loan-to-Value");
            });
        });

        describe("repay", () => {
            const BORROW_AMOUNT = `500${E18}`;
            const DEBT_AMOUNT = `507500000000000000000`; // $507.50

            beforeEach(async () => {
                // user has deposited $1000 worth of collateral
                const COLL_AMOUNT = `10${E18}`;
                const COLL_VALUE = `100${E18}`;

                collateralToken.transferFrom.returns(true);
                debtToken.transferFrom.returns(true);
                debtToken.transfer.returns(true);
                oracle.fetchPrice.returns(COLL_VALUE);

                await market.connect(borrower).deposit(COLL_AMOUNT);
                await market.connect(borrower).borrow(BORROW_AMOUNT);

                expect(await market.userDebt(borrower.address)).to.equal(DEBT_AMOUNT);
            });

            it("can repay debt", async () => {
                await market.connect(borrower).repay(DEBT_AMOUNT);

                expect(await market.userDebt(borrower.address)).to.equal(0);
                expect(await market.totalDebt()).to.equal(0);
            });

            it("can partially repay debt", async () => {
                await market.connect(borrower).repay(`100${E18}`);

                const EXPECTED_DEBT = `407500000000000000000`; // $407.50

                expect(await market.userDebt(borrower.address)).to.equal(EXPECTED_DEBT);
                expect(await market.totalDebt()).to.equal(EXPECTED_DEBT);
            });

            it("can harmlessly waste gas by repaying 0", async () => {
                // let's not waste gas checking _amount > 0
                await market.connect(borrower).repay(`0${E18}`);

                expect(await market.userDebt(borrower.address)).to.equal(DEBT_AMOUNT);
                expect(await market.totalDebt()).to.equal(DEBT_AMOUNT);
            });

            it("cannot repay more than owed debt", async () => {
                await expect(market.connect(borrower).repay(`507500000000000000001`))
                    .to.be.revertedWith("");
            })
        });

        describe("depositAndBorrow", () => {
            it("is a convenience wrapper for the two functions", async () => {
                collateralToken.transferFrom.returns(true);
                debtToken.transfer.returns(true);
                oracle.fetchPrice.returns(`100${E18}`);
                await market.connect(borrower).depositAndBorrow(`10${E18}`, `300${E18}`);

                expect(await market.userCollateral(borrower.address)).to.equal(`10${E18}`);
                expect(await market.userDebt(borrower.address)).to.equal(`304500000000000000000`);
            })
        });

        describe("repayAndWithdraw", () => {
            it("is a convenience wrapper for the two functions", async () => {
                collateralToken.transferFrom.returns(true);
                collateralToken.transfer.returns(true);
                debtToken.transferFrom.returns(true);
                debtToken.transfer.returns(true);
                oracle.fetchPrice.returns(`100${E18}`);
                await market.connect(borrower).depositAndBorrow(`10${E18}`, `300${E18}`);
                await market.connect(borrower).repayAndWithdraw(`304500000000000000000`,`10${E18}`);

                expect(await market.userCollateral(borrower.address)).to.equal(0);
                expect(await market.userDebt(borrower.address)).to.equal(0);
            })
        });

        describe("liquidate", () => {
            beforeEach(async () => {
                // user has deposited $1000 worth of collateral
                const COLL_AMOUNT = `10${E18}`;
                const COLL_VALUE = `100${E18}`;

                collateralToken.transferFrom.returns(true);
                collateralToken.transfer.returns(true);
                debtToken.transfer.returns(true);
                debtToken.transferFrom.returns(true);
                oracle.fetchPrice.returns(COLL_VALUE);

                await market.connect(borrower).deposit(COLL_AMOUNT);
            });

            it("will claim collateral from underwater users", async () => {
                const DEBT_AMOUNT = "507500000000000000000"; // $507.50
                await market.connect(borrower).borrow(`500${E18}`);
                expect(await market.userDebt(borrower.address)).to.equal(DEBT_AMOUNT);

                oracle.fetchPrice.returns(`80${E18}`);
                await market.updatePrice();
                
                // LTV at 63%, ruh roh
                expect(await market.getUserLTV(borrower.address)).to.equal("63437");

                await market.connect(liquidator).liquidate(borrower.address, DEBT_AMOUNT);

                // $507.50 worth of an $80 token is 6.34375
                // 10% liquidation penalty is 0.634375
                // total: 6.978125
                expect(collateralToken.transfer).to.be.calledWith(liquidator.address, "6978125000000000000");
                expect(debtToken.transferFrom).to.be.calledWith(liquidator.address, market.address, DEBT_AMOUNT);
            });

            it("can partially claim collateral from underwater users", async () => {
                const DEBT_AMOUNT = "507500000000000000000"; // $507.50
                await market.connect(borrower).borrow(`500${E18}`);
                expect(await market.userDebt(borrower.address)).to.equal(DEBT_AMOUNT);

                oracle.fetchPrice.returns(`80${E18}`);
                await market.updatePrice();
                
                // LTV at 63%, ruh roh
                expect(await market.getUserLTV(borrower.address)).to.equal("63437");

                // liquidate $100 of debt
                await market.connect(liquidator).liquidate(borrower.address, `100${E18}`);

                // $100 worth of an $80 token is 1.25
                // 10% liquidation penalty is 0.125
                // total: 1.375
                expect(collateralToken.transfer).to.be.calledWith(liquidator.address, "1375000000000000000");
                expect(debtToken.transferFrom).to.be.calledWith(liquidator.address, market.address, `100${E18}`);
            });


            it("will skip users that are solvent", async () => {
                const DEBT_AMOUNT = "507500000000000000000"; // $507.50
                await market.connect(borrower).borrow(`500${E18}`);
                expect(await market.userDebt(borrower.address)).to.equal(DEBT_AMOUNT);

                // LTV at 50.75%, all good
                expect(await market.getUserLTV(borrower.address)).to.equal("50750");

                await expect(market.connect(liquidator).liquidate(borrower.address, DEBT_AMOUNT))
                    .to.be.revertedWith("Market: user solvent");
            });

            it("does something reasonable when collateral is rekt and liquidator willing to buy all of it", async () => {
                const DEBT_AMOUNT = "507500000000000000000"; // $507.50
                await market.connect(borrower).borrow(`500${E18}`);
                expect(await market.userDebt(borrower.address)).to.equal(DEBT_AMOUNT);

                // LTV at 50.75%, all good
                expect(await market.getUserLTV(borrower.address)).to.equal("50750");

                // price falls from $100 to $1
                oracle.fetchPrice.returns(`1${E18}`);
                await market.updatePrice();
                
                // LTV at 5075%, rekt
                expect(await market.getUserLTV(borrower.address)).to.equal("5075000");

                // at this point, this user owes $507.50, but only has $10 worth of collateral
                await market.connect(liquidator).liquidate(borrower.address, DEBT_AMOUNT);

                // the 10% liquidation penalty is applied, so we get the collateral at a 9.1% discount
                // not 10e18 because of rounding issues
                expect(collateralToken.transfer).to.be.calledWith(liquidator.address, '9999999999999999999');
                expect(debtToken.transferFrom).to.be.calledWith(liquidator.address, market.address, "9090909090909090909");

                expect(await market.userCollateral(borrower.address)).to.equal(1); // just dust
                expect(await market.userDebt(borrower.address)).to.equal("498409090909090909091")
            });

            it("does something reasonable when collateral is rekt and liquidator willing to buy part of it", async () => {
                const DEBT_AMOUNT = "507500000000000000000"; // $507.50
                await market.connect(borrower).borrow(`500${E18}`);
                expect(await market.userDebt(borrower.address)).to.equal(DEBT_AMOUNT);

                // LTV at 50.75%, all good
                expect(await market.getUserLTV(borrower.address)).to.equal("50750");

                // price falls from $100 to $1
                oracle.fetchPrice.returns(`1${E18}`);
                await market.updatePrice();
                
                // LTV at 5075%, rekt
                expect(await market.getUserLTV(borrower.address)).to.equal("5075000");

                // at this point, this user owes $507.50, but only has $10 worth of collateral, let's buy 5 of it
                await market.connect(liquidator).liquidate(borrower.address, `5${E18}`);

                // $5.00 worth of an $10 token is 5.0
                // 10% liquidation penalty is 0.5
                // total: 5.5
                expect(collateralToken.transfer).to.be.calledWith(liquidator.address, '5500000000000000000');
                expect(debtToken.transferFrom).to.be.calledWith(liquidator.address, market.address, `5${E18}`);
            });
        });
    });
})