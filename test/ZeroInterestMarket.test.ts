import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import {
    IDebtToken,
    IERC20,
    IOracle,
    IFlashSwap,
    ZeroInterestMarket,
    ZeroInterestMarket__factory
} from "../typechain";
import { ethers } from "hardhat";
import chai, { expect } from "chai";
import { FakeContract, smock } from "@defi-wonderland/smock";

chai.use(smock.matchers);

const E18 = '000000000000000000'; // 18 zeros

const increaseTime = async (timeJumpSeconds: number) => {
    await ethers.provider.send("evm_increaseTime", [timeJumpSeconds]);
};
  
describe("ZeroInterestMarket", () => {
    let owner: SignerWithAddress;
    let borrower: SignerWithAddress;
    let treasury: SignerWithAddress;
    let liquidator: SignerWithAddress;
    let other: SignerWithAddress;
    let debtToken: FakeContract<IDebtToken>;
    let collateralToken: FakeContract<IERC20>;
    let oracle: FakeContract<IOracle>;
    let market: ZeroInterestMarket;
    let swapper: FakeContract<IFlashSwap>;

    context("post-construction", () => {
        beforeEach(async () => {
            [owner, treasury, borrower, liquidator, other] = await ethers.getSigners();
            debtToken = await smock.fake<IDebtToken>("IDebtToken");
            collateralToken = await smock.fake<IERC20>("IERC20");
            oracle = await smock.fake<IOracle>("IOracle");
            swapper = await smock.fake<IFlashSwap>("IFlashSwap");
            market = await new ZeroInterestMarket__factory(owner).deploy();
            await market.initialize(
              owner.address,
              treasury.address,
              collateralToken.address,
              debtToken.address,
              oracle.address,
              60000, // loan-to-value (60%)
              1500, // borrow rate (1.5%)
              10000 // liquidation penalty (10%)
            );
        });

        describe("deposit", () => {
            it("deposits collateral for user", async () => {
                const AMOUNT = 100000;
                collateralToken.transferFrom.returns(true);
                oracle.fetchPrice.returns([true, `10${E18}`]);

                await expect(market.connect(borrower).deposit(borrower.address, AMOUNT)).
                    to.emit(market, "Deposit").withArgs(borrower.address, borrower.address, AMOUNT);

                expect(collateralToken.transferFrom).to.be.calledWith(borrower.address, market.address, AMOUNT);
            });

            it("updates bookkeeping", async () => {
                const AMOUNT = 100000;
                collateralToken.transferFrom.returns(true);
                oracle.fetchPrice.returns([true, `10${E18}`]);

                await market.connect(borrower).deposit(borrower.address, AMOUNT);

                expect(await market.totalCollateral()).to.equal(AMOUNT);
                expect(await market.userCollateral(borrower.address)).to.equal(AMOUNT);
            });

            it("depositor emits event", async () => {
                const AMOUNT = 100000;
                collateralToken.transferFrom.returns(true);
                oracle.fetchPrice.returns([true, `10${E18}`]);

                await expect(market.connect(borrower).deposit(borrower.address, AMOUNT)).
                    to.emit(market, "Deposit").withArgs(borrower.address, borrower.address, AMOUNT);
            });

            it("can deposit collateral to another user", async () => {
                const AMOUNT = 100000;
                collateralToken.transferFrom.returns(true);
                oracle.fetchPrice.returns([true, `10${E18}`]);

                await expect(market.connect(borrower).deposit(other.address, AMOUNT)).
                    to.emit(market, "Deposit").withArgs(borrower.address, other.address, AMOUNT);

                expect(collateralToken.transferFrom).to.be.calledWith(borrower.address, market.address, AMOUNT);
                expect(await market.totalCollateral()).to.equal(AMOUNT);
                expect(await market.userCollateral(other.address)).to.equal(AMOUNT);
            });
        });

        describe("borrow", () => {
            beforeEach(async () => {
                // user has deposited $1000 worth of collateral
                const COLL_AMOUNT = `10${E18}`;
                const COLL_VALUE = `100${E18}`;

                collateralToken.transferFrom.returns(true);
                oracle.fetchPrice.returns([true, COLL_VALUE]);

                await expect(market.connect(borrower).deposit(borrower.address, COLL_AMOUNT)).
                    to.emit(market, "Deposit").withArgs(borrower.address, borrower.address, COLL_AMOUNT);
            });

            it("transfers the borrowed token to the borrower", async () => {
                const BORROW_AMOUNT = `10${E18}`;
                debtToken.transfer.returns(true);
                await market.connect(borrower).borrow(borrower.address, BORROW_AMOUNT);
                expect(debtToken.transfer).to.be.calledWith(borrower.address, BORROW_AMOUNT);
            });

            it("borrow event emitted", async () => {
                const BORROW_AMOUNT = `10${E18}`;
                debtToken.transfer.returns(true);
                await expect(market.connect(borrower).borrow(borrower.address, BORROW_AMOUNT)).
                    to.emit(market, "Borrow").withArgs(borrower.address, borrower.address, BORROW_AMOUNT);
            });

            it("reserves the fee amount for the treasury", async () => {
                const BORROW_AMOUNT = `10${E18}`;
                const FEE_AMOUNT = '150000000000000000'; // $0.15
                debtToken.transfer.returns(true);
                await market.connect(borrower).borrow(borrower.address, BORROW_AMOUNT);
                expect(await market.feesCollected()).to.equal(FEE_AMOUNT);
            });

            it("sets user's total debt to borrowed + fee", async () => {
                const BORROW_AMOUNT = `10${E18}`;
                const TOTAL_DEBT = '10150000000000000000'; // $10.15
                debtToken.transfer.returns(true);
                await market.connect(borrower).borrow(borrower.address, BORROW_AMOUNT);
                expect(await market.userDebt(borrower.address)).to.equal(TOTAL_DEBT);
                expect(await market.totalDebt()).to.equal(TOTAL_DEBT);
                expect(await market.getUserLTV(borrower.address)).to.equal("1015");
            });

            it("allows up to LTV limit for those that live dangerously", async () => {
                // this is an LTV of exactly 60%
                const BORROW_AMOUNT = `591140000000000000000`;
                debtToken.transfer.returns(true);
                await market.connect(borrower).borrow(borrower.address, BORROW_AMOUNT);
                expect(await market.getUserLTV(borrower.address)).to.equal("60000");
            });

            it("reverts if LTV is too high", async () => {
                const BORROW_AMOUNT = `1000${E18}`;
                debtToken.transfer.returns(true);
                await expect(market.connect(borrower).borrow(borrower.address, BORROW_AMOUNT))
                    .to.be.revertedWith("Market: exceeds Loan-to-Value");
                
                expect(await market.totalDebt()).to.equal("0");
            });

            it("reverts on LTV is too high bounds", async () => {
                // this is an LTV of exactly 60.001%
                const BORROW_AMOUNT = `591150000000000000000`;
                debtToken.transfer.returns(true);
                await expect(market.connect(borrower).borrow(borrower.address, BORROW_AMOUNT))
                    .to.be.revertedWith("Market: exceeds Loan-to-Value");
                
                expect(await market.totalDebt()).to.equal("0");
            });

            it("can transfer borrowed tokens to another account", async () => {
                const BORROW_AMOUNT = `10${E18}`;
                const TOTAL_DEBT = '10150000000000000000'; // $10.15
                debtToken.transfer.returns(true);
                await market.connect(borrower).borrow(other.address, BORROW_AMOUNT);
                expect(await market.userDebt(borrower.address)).to.equal(TOTAL_DEBT);
                expect(await market.totalDebt()).to.equal(TOTAL_DEBT);
                expect(debtToken.transfer).to.be.calledWith(other.address, BORROW_AMOUNT);
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
                oracle.fetchPrice.returns([true, COLL_VALUE]);

                await expect(market.connect(borrower).deposit(borrower.address, COLL_AMOUNT)).
                    to.emit(market, "Deposit").withArgs(borrower.address, borrower.address, COLL_AMOUNT);
                await expect(market.connect(borrower).borrow(borrower.address, BORROW_AMOUNT)).
                    to.emit(market, "Borrow").withArgs(borrower.address, borrower.address, BORROW_AMOUNT);

                expect(await market.userDebt(borrower.address)).to.equal(DEBT_AMOUNT);
            });

            it("emits event", async () => {
                await expect(market.connect(borrower).withdraw(borrower.address, `1${E18}`)).
                    to.emit(market, "Withdraw").withArgs(borrower.address, borrower.address, `1${E18}`);
            });

            it("removes collateral", async () => {
                await market.connect(borrower).withdraw(borrower.address, `1${E18}`);

                expect(await market.userCollateral(borrower.address)).to.equal(`9${E18}`);
                expect(await market.totalCollateral()).to.equal(`9${E18}`);
                expect(collateralToken.transfer).to.be.calledWith(borrower.address, `1${E18}`)
            });

            it("reverts if reducing LTV below limit", async () => {
                await expect(market.connect(borrower).withdraw(borrower.address, `9${E18}`))
                    .to.be.revertedWith("Market: exceeds Loan-to-Value");
                
                expect(await market.userCollateral(borrower.address)).to.equal(COLL_AMOUNT);
                expect(await market.totalCollateral()).to.equal(COLL_AMOUNT);
            });

            it("bounds check on LTV", async () => {
                await market.connect(borrower).withdraw(borrower.address, `1541800000000000000`);
                expect(await market.getUserLTV(borrower.address)).to.equal("60000");
            });

            it("withdrawal exceeds collateral balance", async () => {
                await expect(market.connect(borrower).withdraw(borrower.address, `11${E18}`))
                    .to.be.revertedWith("Market: amount too large");
            });  

            it("reverts if LTV is exceeded (bounds check)", async () => {
                await expect(market.connect(borrower).withdraw(borrower.address, `1541900000000000000`))
                    .to.be.revertedWith("Market: exceeds Loan-to-Value");
                expect(await market.userCollateral(borrower.address)).to.equal(COLL_AMOUNT);
                expect(await market.totalCollateral()).to.equal(COLL_AMOUNT);
            });

            it("can remove collateral and transfer to another account", async () => {
                await market.connect(borrower).withdraw(other.address, `1${E18}`);

                expect(await market.userCollateral(borrower.address)).to.equal(`9${E18}`);
                expect(await market.totalCollateral()).to.equal(`9${E18}`);
                expect(collateralToken.transfer).to.be.calledWith(other.address, `1${E18}`)
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
                oracle.fetchPrice.returns([true, COLL_VALUE]);

                await market.connect(borrower).deposit(borrower.address, COLL_AMOUNT);
                await market.connect(borrower).borrow(borrower.address, BORROW_AMOUNT);

                expect(await market.userDebt(borrower.address)).to.equal(DEBT_AMOUNT);
            });

            it("can repay debt", async () => {
                await market.connect(borrower).repay(borrower.address, DEBT_AMOUNT);

                expect(await market.userDebt(borrower.address)).to.equal(0);
                expect(await market.totalDebt()).to.equal(0);
                expect(debtToken.transferFrom).to.be.calledWith(borrower.address, market.address, DEBT_AMOUNT)
            });

            it("can partially repay debt", async () => {
                await market.connect(borrower).repay(borrower.address, `100${E18}`);

                const EXPECTED_DEBT = `407500000000000000000`; // $407.50

                expect(await market.userDebt(borrower.address)).to.equal(EXPECTED_DEBT);
                expect(await market.totalDebt()).to.equal(EXPECTED_DEBT);
            });

            it("emit event", async () => {
                await expect(market.connect(borrower).repay(borrower.address, DEBT_AMOUNT)).
                    to.emit(market, "Repay").withArgs(borrower.address, borrower.address, DEBT_AMOUNT);
            });

            it("can harmlessly waste gas by repaying 0", async () => {
                // let's not waste gas checking _amount > 0
                await market.connect(borrower).repay(borrower.address, `0${E18}`);

                expect(await market.userDebt(borrower.address)).to.equal(DEBT_AMOUNT);
                expect(await market.totalDebt()).to.equal(DEBT_AMOUNT);
            });

            it("cannot repay more than owed debt", async () => {
                await expect(market.connect(borrower).repay(borrower.address, `507500000000000000001`))
                    .to.be.revertedWith("");
            });

            it("can repay another users' debt", async () => {
                await expect(market.connect(other).repay(borrower.address, DEBT_AMOUNT)).
                    to.emit(market, "Repay").withArgs(other.address, borrower.address, DEBT_AMOUNT);

                expect(await market.userDebt(borrower.address)).to.equal(0);
                expect(await market.totalDebt()).to.equal(0);
                expect(debtToken.transferFrom).to.be.calledWith(other.address, market.address, DEBT_AMOUNT)
            });
        });

        describe("depositAndBorrow", () => {
            it("is a convenience wrapper for the two functions", async () => {
                collateralToken.transferFrom.returns(true);
                debtToken.transfer.returns(true);
                oracle.fetchPrice.returns([true, `100${E18}`]);
                await market.connect(borrower).depositAndBorrow(`10${E18}`, `300${E18}`);

                expect(await market.userCollateral(borrower.address)).to.equal(`10${E18}`);
                expect(await market.userDebt(borrower.address)).to.equal(`304500000000000000000`);
            });
        });

        describe("repayAndWithdraw", () => {
            it("is a convenience wrapper for the two functions", async () => {
                collateralToken.transferFrom.returns(true);
                collateralToken.transfer.returns(true);
                debtToken.transferFrom.returns(true);
                debtToken.transfer.returns(true);
                oracle.fetchPrice.returns([true, `100${E18}`]);
                await expect(market.connect(borrower).depositAndBorrow(`10${E18}`, `300${E18}`)).
                    to.emit(market, "Deposit").withArgs(borrower.address, borrower.address,`10${E18}`).
                    and.emit(market, "Borrow").withArgs(borrower.address, borrower.address,`300${E18}`);
                await expect(market.connect(borrower).repayAndWithdraw(`304500000000000000000`, `10${E18}`)).
                    to.emit(market, "Repay").withArgs(borrower.address, borrower.address,`304500000000000000000`).
                    and.emit(market, "Withdraw").withArgs(borrower.address, borrower.address,`10${E18}`);

                expect(await market.userCollateral(borrower.address)).to.equal(0);
                expect(await market.userDebt(borrower.address)).to.equal(0);
            })
        });

        describe("repayAndWithdraw - bad oracle", () => {
            it("test with bad oracle", async () => {
                collateralToken.transferFrom.returns(true);
                collateralToken.transfer.returns(true);
                debtToken.transferFrom.returns(true);
                debtToken.transfer.returns(true);
                oracle.fetchPrice.returns([true, `100${E18}`]);
                
                await expect(market.connect(borrower).depositAndBorrow(`10${E18}`, `300${E18}`)).
                    to.emit(market, "Deposit").withArgs(borrower.address, borrower.address,`10${E18}`).
                    and.emit(market, "Borrow").withArgs(borrower.address, borrower.address, `300${E18}`);
                
                // Mock a bad oracle
                oracle.fetchPrice.returns([false, `0`]);
                increaseTime(3601);

                // Ensure repay + withdraw is frozen
                await expect(market.connect(borrower).repayAndWithdraw(`304500000000000000000`, `10${E18}`)).
                    to.be.revertedWith("Market: frozen");
                
                // Ensure repay works
                await expect(market.connect(borrower).repay(borrower.address, `304500000000000000000`)).
                    to.emit(market, "Repay").withArgs(borrower.address, borrower.address, `304500000000000000000`);

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
                oracle.fetchPrice.returns([true, COLL_VALUE]);

                await market.connect(borrower).deposit(borrower.address, COLL_AMOUNT);
            });

            it("will claim collateral from underwater users", async () => {
                const DEBT_AMOUNT = "507500000000000000000"; // $507.50
                const PRICE = `80${E18}`;
                await market.connect(borrower).borrow(borrower.address, `500${E18}`);
                expect(await market.userDebt(borrower.address)).to.equal(DEBT_AMOUNT);

                oracle.fetchPrice.returns([true, PRICE]);
                await market.updatePrice();
                
                // LTV at 63%, ruh roh
                expect(await market.getUserLTV(borrower.address)).to.equal("63437");

                // liquidation penalty 10%, so price collateral at $72
                // $507.50 worth of collateral at $72 is 7.0486
                const collateralLiquidated = `704861111111111111`;

                await expect(market.connect(liquidator).liquidate(borrower.address, DEBT_AMOUNT, liquidator.address, ethers.constants.AddressZero)).
                    to.emit(market, "Liquidate").withArgs(borrower.address, liquidator.address, DEBT_AMOUNT, collateralLiquidated, PRICE).
                    and.emit(market, "Repay").withArgs(liquidator.address, borrower.address, DEBT_AMOUNT).
                    and.emit(market, "Withdraw").withArgs(borrower.address, liquidator.address, collateralLiquidated);
               
                expect(collateralToken.transfer).to.be.calledWith(liquidator.address, collateralLiquidated);
                expect(debtToken.transferFrom).to.be.calledWith(liquidator.address, market.address, DEBT_AMOUNT);
            });

            it("can us a swapper to obtain debt tokens from collateral on open market", async () => {
                const DEBT_AMOUNT = "507500000000000000000"; // $507.50
                await market.connect(borrower).borrow(borrower.address, `500${E18}`);
                expect(await market.userDebt(borrower.address)).to.equal(DEBT_AMOUNT);

                const PRICE = `80${E18}`;
                oracle.fetchPrice.returns([true, PRICE]);
                await market.updatePrice();
                
                // LTV at 63%, ruh roh
                expect(await market.getUserLTV(borrower.address)).to.equal("63437");

                // liquidation penalty 10%, so price collateral at $72
                // $507.50 worth of collateral at $72 is 7.0486
                const collateralLiquidated = `704861111111111111`;

                await expect(market.connect(liquidator).liquidate(borrower.address, DEBT_AMOUNT, liquidator.address, swapper.address)).
                    to.emit(market, "Liquidate").withArgs(borrower.address, liquidator.address, DEBT_AMOUNT, collateralLiquidated, PRICE).
                    and.emit(market, "Repay").withArgs(liquidator.address, borrower.address, DEBT_AMOUNT).
                    and.emit(market, "Withdraw").withArgs(borrower.address, liquidator.address, collateralLiquidated);
               
                expect(swapper.swap).to.be.calledWith(collateralToken.address, debtToken.address, liquidator.address, ethers.BigNumber.from(DEBT_AMOUNT), ethers.BigNumber.from(collateralLiquidated));
                expect(collateralToken.transfer).to.be.calledWith(liquidator.address, collateralLiquidated);
                expect(debtToken.transferFrom).to.be.calledWith(liquidator.address, market.address, DEBT_AMOUNT);
            });

            it("can partially claim collateral from underwater users", async () => {
                const DEBT_AMOUNT = "507500000000000000000"; // $507.50
                await market.connect(borrower).borrow(borrower.address, `500${E18}`);
                expect(await market.userDebt(borrower.address)).to.equal(DEBT_AMOUNT);

                oracle.fetchPrice.returns([true, `80${E18}`]);
                await market.updatePrice();
                
                // LTV at 63%, ruh roh
                expect(await market.getUserLTV(borrower.address)).to.equal("63437");

                // liquidate $100 of debt
                const REPAY_AMOUNT = `100${E18}`;
                await market.connect(liquidator).liquidate(borrower.address, REPAY_AMOUNT, liquidator.address, ethers.constants.AddressZero);

                // liquidation penalty 10%, so price collateral at $72
                // $100 worth of an $72 token is 1.38888
                expect(collateralToken.transfer).to.be.calledWith(liquidator.address, "138888888888888888");
                expect(debtToken.transferFrom).to.be.calledWith(liquidator.address, market.address, REPAY_AMOUNT);
            });

            it("will skip users that are solvent", async () => {
                const DEBT_AMOUNT = "507500000000000000000"; // $507.50
                await market.connect(borrower).borrow(borrower.address, `500${E18}`);
                expect(await market.userDebt(borrower.address)).to.equal(DEBT_AMOUNT);

                // LTV at 50.75%, all good
                expect(await market.getUserLTV(borrower.address)).to.equal("50750");

                await expect(market.connect(liquidator).liquidate(borrower.address, DEBT_AMOUNT, liquidator.address, ethers.constants.AddressZero))
                    .to.be.revertedWith("Market: user solvent");
            });

            it("allows liquidator to buy all collateral when collateral's value is less than debt", async () => {
                const DEBT_AMOUNT = "507500000000000000000"; // $507.50
                await market.connect(borrower).borrow(borrower.address, `500${E18}`);
                expect(await market.userDebt(borrower.address)).to.equal(DEBT_AMOUNT);

                // LTV at 50.75%, all good
                expect(await market.getUserLTV(borrower.address)).to.equal("50750");

                // price falls from $100 to $1
                oracle.fetchPrice.returns([true, `1${E18}`]);
                await market.updatePrice();
                
                // LTV at 5075%, rekt
                expect(await market.getUserLTV(borrower.address)).to.equal("5075000");

                // at this point, this user owes $507.50, but only has $10 worth of collateral
                await market.connect(liquidator).liquidate(borrower.address, DEBT_AMOUNT, liquidator.address, ethers.constants.AddressZero);

                // 10% liquidation penallty, so buy the collateral at $0.90
                // 10 tokens of collateral @ $0.90 is $9
                expect(collateralToken.transfer).to.be.calledWith(liquidator.address, `10${E18}`);
                expect(debtToken.transferFrom).to.be.calledWith(liquidator.address, market.address, `9${E18}`);

                expect(await market.userCollateral(borrower.address)).to.equal(0);
                expect(await market.userDebt(borrower.address)).to.equal("498500000000000000000");
            });

            it("allows liquidator to buy some of the collateral even if worth less than the debt", async () => {
                const DEBT_AMOUNT = "507500000000000000000"; // $507.50
                await market.connect(borrower).borrow(borrower.address, `500${E18}`);
                expect(await market.userDebt(borrower.address)).to.equal(DEBT_AMOUNT);

                // LTV at 50.75%, all good
                expect(await market.getUserLTV(borrower.address)).to.equal("50750");

                // price falls from $100 to $1
                oracle.fetchPrice.returns([true, `1${E18}`]);
                await market.updatePrice();
                
                // LTV at 5075%, rekt
                expect(await market.getUserLTV(borrower.address)).to.equal("5075000");

                // at this point, this user owes $507.50, but only has $10 worth of collateral
                // liquidator buys $5 of it
                await market.connect(liquidator).liquidate(borrower.address, `5${E18}`, liquidator.address, ethers.constants.AddressZero);

                // 10% liquidation penallty, so buy the collateral at $0.90
                // $5 with of $0.90 tokens is 5.555555
                expect(collateralToken.transfer).to.be.calledWith(liquidator.address, '555555555555555555');
                expect(debtToken.transferFrom).to.be.calledWith(liquidator.address, market.address, `5${E18}`);
            });

            it("cannot liquidate themself", async () => {
                await expect(market.connect(liquidator).liquidate(liquidator.address, 1, liquidator.address, ethers.constants.AddressZero)).
                    to.be.revertedWith("Market: cannot liquidate self");
            });

            it("can send claimed collateral to another user", async () => {
                const DEBT_AMOUNT = "507500000000000000000"; // $507.50
                await market.connect(borrower).borrow(borrower.address, `500${E18}`);
                expect(await market.userDebt(borrower.address)).to.equal(DEBT_AMOUNT);

                const PRICE = `80${E18}`;
                oracle.fetchPrice.returns([true, PRICE]);
                await market.updatePrice();
                
                // LTV at 63%, ruh roh
                expect(await market.getUserLTV(borrower.address)).to.equal("63437");

                // liquidation penalty 10%, so price collateral at $72
                // $507.50 worth of collateral at $72 is 7.0486
                const collateralLiquidated = `704861111111111111`;

                await expect(market.connect(liquidator).liquidate(borrower.address, DEBT_AMOUNT, other.address, ethers.constants.AddressZero)).
                    to.emit(market, "Liquidate").withArgs(borrower.address, other.address, DEBT_AMOUNT, collateralLiquidated, PRICE).
                    and.emit(market, "Repay").withArgs(liquidator.address, borrower.address, DEBT_AMOUNT).
                    and.emit(market, "Withdraw").withArgs(borrower.address, other.address, collateralLiquidated);
               
                expect(collateralToken.transfer).to.be.calledWith(other.address, collateralLiquidated);
                expect(debtToken.transferFrom).to.be.calledWith(liquidator.address, market.address, DEBT_AMOUNT);
            });          
            
        });
        describe("Frozen market - bad oracle price", () => {
            it("no good oracle price", async () => {                  
            const AMOUNT = 100000;       
            oracle.fetchPrice.returns([false, `0`]);
            await expect(market.connect(liquidator).liquidate(borrower.address, AMOUNT, liquidator.address, ethers.constants.AddressZero)).
            to.be.revertedWith("Market: frozen");
                             
            await expect(market.connect(borrower).deposit(borrower.address, AMOUNT)).
            to.be.revertedWith("Market: frozen");

            await expect(market.connect(borrower).depositAndBorrow(AMOUNT, AMOUNT)).
            to.be.revertedWith("Market: frozen");

            await expect(market.connect(borrower).borrow(borrower.address, AMOUNT)).
            to.be.revertedWith("Market: frozen");            
        }); 
    });    
        describe("harvestFees", () => {
            it("transfers fees to the treasury", async () => {
                collateralToken.transferFrom.returns(true);
                debtToken.transfer.returns(true);
                oracle.fetchPrice.returns([true, `100${E18}`]);
                await market.connect(borrower).depositAndBorrow(`10${E18}`, `200${E18}`);
                
                expect(await market.feesCollected()).to.equal(`3${E18}`);

                await market.harvestFees();

                expect(await market.feesCollected()).to.equal(0);
                expect(debtToken.transfer).to.be.calledWith(treasury.address, `3${E18}`);
            });
        });

        describe("reduceSupply", () => {
            it("transfers the debt tokens to the owner", async () => {
                debtToken.transfer.returns(true);
                await market.connect(owner).reduceSupply(`1000${E18}`);

                expect(debtToken.transfer).to.be.calledWith(owner.address, `1000${E18}`);
            });

            it("can only be called by the owner", async () => {
                await expect(market.connect(other).reduceSupply(`1000${E18}`)).
                    to.be.revertedWith("Ownable: caller is not the owner");
            });
        });

        describe("setTreasury", () => {
            it("can change the treasury address", async () => {
                expect(await market.treasury()).to.equal(treasury.address);
                await market.connect(owner).setTreasury(other.address);
                expect(await market.treasury()).to.equal(other.address);
            });

            it("emits an event", async () => {
                await expect(market.connect(owner).setTreasury(other.address)).
                    to.emit(market, "TreasuryUpdated").withArgs(other.address);
            });

            it("can only be done by the owner", async () => {
                await expect(market.connect(other).setTreasury(other.address)).
                    to.be.revertedWith("Ownable: caller is not the owner");
            });

            it("cannot be set to a zero address", async () => {
                await expect(market.connect(owner).setTreasury(ethers.constants.AddressZero)).
                    to.be.revertedWith("Market: 0x0 treasury address");
            });
        });

        describe("setOracle", () => {
            it("can change the oracle address", async () => {
                expect(await market.oracle()).to.equal(oracle.address);
                await market.connect(owner).setOracle(other.address);
                expect(await market.oracle()).to.equal(other.address);
            });

            it("emits an event", async () => {
                await expect(market.connect(owner).setOracle(other.address)).
                    to.emit(market, "OracleUpdated").withArgs(other.address);
            });

            it("can only be done by the owner", async () => {
                await expect(market.connect(other).setOracle(other.address)).
                    to.be.revertedWith("Ownable: caller is not the owner");
            });

            it("cannot be set to a zero address", async () => {
                await expect(market.connect(owner).setOracle(ethers.constants.AddressZero)).
                    to.be.revertedWith("Market: 0x0 oracle address");
            });
        });

        describe("recoverERC20", () => {
            it("transfer random ERC20 tokens to the owner", async () => {
                let token = await smock.fake<IERC20>("IERC20");
                token.transfer.returns(true);
                await market.connect(owner).recoverERC20(token.address, 100);
                expect(token.transfer).to.be.calledWith(owner.address, 100);
            });

            it("cannot recover debt token", async () => {
                await expect(market.connect(owner).recoverERC20(debtToken.address, 100)).
                    to.be.revertedWith("Cannot recover debt tokens");
            });

            it("cannot recover collateral token", async () => {
                await expect(market.connect(owner).recoverERC20(collateralToken.address, 100)).
                    to.be.revertedWith("Cannot recover collateral tokens");
            });

            it("can only be done by the owner", async () => {
                await expect(market.connect(other).recoverERC20(collateralToken.address, 100)).
                    to.be.revertedWith("Ownable: caller is not the owner");
            });
        });
    });
})