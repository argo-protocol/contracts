import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { DebtToken, DebtToken__factory, TestFlashBorrower, TestFlashBorrower__factory } from "../typechain";
import { expect } from "chai";
import { ethers } from "hardhat";

const E18 = "000000000000000000";

describe("DebtToken", () => {
    let owner: SignerWithAddress;
    let treasury: SignerWithAddress;
    let other: SignerWithAddress;

    beforeEach(async () => {
        [owner, treasury, other] = await ethers.getSigners();
    });

    describe("constructor", () => {
        it("sets the constants", async () => {
            const token = await new DebtToken__factory(owner).deploy(
                owner.address,
                treasury.address,
                "Argo Stablecoin",
                "ARGO"
            );

            expect(await token.name()).to.equal("Argo Stablecoin");
            expect(await token.symbol()).to.equal("ARGO");
            expect(await token.decimals()).to.equal(18);
            expect(await token.totalSupply()).to.equal(0);
        });
    });

    describe("post-construction", () => {
        let token: DebtToken;
        beforeEach(async () => {
            token = await new DebtToken__factory(owner).deploy(
                owner.address,
                treasury.address,
                "Argo Stablecoin",
                "ARGO"
            );
        });

        describe("mint", () => {
            it("mints the amount to the to address", async () => {
                await token.connect(owner).mint(other.address, 1234);

                expect(await token.balanceOf(other.address)).to.equal(1234);
                expect(await token.totalSupply()).to.equal(1234);
            });

            it("can only be done by the owner", async () => {
                await expect(token.connect(other).mint(other.address, 1234)).to.be.revertedWith(
                    "Ownable: caller is not the owner"
                );
            });
        });

        describe("burn", () => {
            it("burns the given amount of the token", async () => {
                await token.connect(owner).mint(owner.address, 1234);
                await token.connect(owner).burn(1234);

                expect(await token.balanceOf(owner.address)).to.equal(0);
            });

            it("can be called by anyone", async () => {
                await token.connect(owner).mint(other.address, 1234);
                await token.connect(other).burn(1234);

                expect(await token.balanceOf(other.address)).to.equal(0);
            });

            it("reverts if burning more than balance", async () => {
                await token.connect(owner).mint(other.address, 1234);
                await expect(token.connect(other).burn(1235)).to.be.revertedWith("ERC20: burn amount exceeds balance");
            });
        });

        describe("maxFlashLoan", () => {
            it("returns the max flash loan value", async () => {
                await token.setMaxFlashLoanAmount(`100000${E18}`);
                expect(await token.maxFlashLoan(token.address)).to.equal(`100000${E18}`);
            });

            it("returns 0 if an address other than this token is passed", async () => {
                await token.setMaxFlashLoanAmount(`100000${E18}`);
                expect(await token.maxFlashLoan(other.address)).to.equal(0);
            });
        });

        describe("flashFee", () => {
            it("calculates the fee for a flash loan", async () => {
                await token.setFlashFeeRate(100); // 0.1%
                expect(await token.flashFee(token.address, `1000${E18}`)).to.equal(`1${E18}`);
            });

            it("safely returns zero when the rate is zero", async () => {
                await token.setFlashFeeRate(0);
                expect(await token.flashFee(token.address, `1000${E18}`)).to.equal(0);
            });

            it("reverts if another token is passed", async () => {
                await expect(token.flashFee(other.address, `1000${E18}`)).to.be.revertedWith(
                    "ERC20FlashMint: wrong token"
                );
            });
        });

        describe("flashLoan", () => {
            const MAX_FLASH_LOAN = `1000000${E18}`;
            const FLASH_LOAN_RATE = 100;

            beforeEach(async () => {
                await token.connect(owner).setFlashFeeRate(FLASH_LOAN_RATE);
                await token.connect(owner).setMaxFlashLoanAmount(MAX_FLASH_LOAN);
            });

            it("can allows flash loans", async () => {
                let borrower = await new TestFlashBorrower__factory(other).deploy(true);
                const FEE_AMOUNT = `1${E18}`;
                await token.mint(borrower.address, FEE_AMOUNT);
                await token.flashLoan(borrower.address, token.address, `1000${E18}`, []);

                expect(await borrower.lastAmount()).to.equal(`1000${E18}`);
                expect(await borrower.lastFee()).to.equal(FEE_AMOUNT);
                expect(await borrower.lastData()).to.equal("0x");

                expect(await token.feesCollected()).to.equal(FEE_AMOUNT);
            });

            it("burns all flash loaned amount", async () => {
                let borrower = await new TestFlashBorrower__factory(other).deploy(true);
                const FEE_AMOUNT = `1${E18}`;
                await token.mint(borrower.address, FEE_AMOUNT);
                await token.flashLoan(borrower.address, token.address, `1000${E18}`, []);

                expect(await token.totalSupply()).to.equal(0);
            });

            it("will revert if borrower doesn't approve enough", async () => {
                const APPROVE_FEES = false;
                const FEE_AMOUNT = `1${E18}`;
                let borrower = await new TestFlashBorrower__factory(other).deploy(APPROVE_FEES);
                await token.mint(borrower.address, FEE_AMOUNT);
                await expect(token.flashLoan(borrower.address, token.address, `1000${E18}`, [])).to.be.revertedWith(
                    "allowance does not allow refund"
                );
            });

            it("is capped", async () => {
                let borrower = await new TestFlashBorrower__factory(other).deploy(true);
                const FEE_AMOUNT = `10000000${E18}`;
                const BORROW_AMOUNT = `1000000000000000000000001`;
                await token.mint(borrower.address, FEE_AMOUNT);
                await expect(token.flashLoan(borrower.address, token.address, BORROW_AMOUNT, [])).to.be.revertedWith(
                    "DebtToken: amount above max"
                );
            });
        });

        describe("harvestFees", () => {
            const MAX_FLASH_LOAN = `1000000${E18}`;
            const FLASH_LOAN_RATE = 100;
            const FEE_AMOUNT = `1${E18}`;

            beforeEach(async () => {
                await token.connect(owner).setFlashFeeRate(FLASH_LOAN_RATE);
                await token.connect(owner).setMaxFlashLoanAmount(MAX_FLASH_LOAN);

                let borrower = await new TestFlashBorrower__factory(other).deploy(true);
                await token.mint(borrower.address, FEE_AMOUNT);
                await token.flashLoan(borrower.address, token.address, `1000${E18}`, []);
            });

            it("mints fees to the treasury", async () => {
                await token.connect(other).harvestFees();

                expect(await token.balanceOf(treasury.address)).to.equal(FEE_AMOUNT);
                expect(await token.feesCollected()).to.equal(0);
            });

            it("emits an event", async () => {
                await expect(token.connect(other).harvestFees()).to.emit(token, "FeesHarvested").withArgs(FEE_AMOUNT);
            });
        });

        describe("setFlashFeeRate", () => {
            it("updates the flashFeeRate", async () => {
                await expect(token.connect(owner).setFlashFeeRate(100))
                    .to.emit(token, "FlashFeeRateUpdated")
                    .withArgs(100);
            });

            it("can only be done by owner", async () => {
                await expect(token.connect(other).setFlashFeeRate(100)).to.be.revertedWith(
                    "Ownable: caller is not the owner"
                );
            });

            it("cannot set a rate greater than 100%", async () => {
                await expect(token.connect(owner).setFlashFeeRate(100000)).to.be.revertedWith(
                    "DebtToken: rate too high"
                );
            });
        });

        describe("setMaxFlashLoanAmount", () => {
            it("updates the maxFlashLoanAmount", async () => {
                await expect(token.connect(owner).setMaxFlashLoanAmount(`10000${E18}`))
                    .to.emit(token, "MaxFlashLoanAmountUpdated")
                    .withArgs(`10000${E18}`);
            });

            it("can only be done by owner", async () => {
                await expect(token.connect(other).setMaxFlashLoanAmount(100)).to.be.revertedWith(
                    "Ownable: caller is not the owner"
                );
            });
        });

        describe("setTreasury", () => {
            it("updates the treasury", async () => {
                await expect(token.connect(owner).setTreasury(other.address))
                    .to.emit(token, "TreasuryUpdated")
                    .withArgs(other.address);
            });

            it("can only be done by owner", async () => {
                await expect(token.connect(other).setTreasury(other.address)).to.be.revertedWith(
                    "Ownable: caller is not the owner"
                );
            });

            it("cannot be set to zero address", async () => {
                await expect(token.connect(owner).setTreasury(ethers.constants.AddressZero)).to.be.revertedWith(
                    "DebtToken: 0x0 treasury address"
                );
            });
        });
    });
});
