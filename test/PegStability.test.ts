import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { IERC20Metadata, IERC20, PegStability, PegStability__factory } from "../typechain";
import { ethers } from "hardhat";
import chai, { expect } from "chai";
import { FakeContract, smock } from "@defi-wonderland/smock";

chai.use(smock.matchers);

const E18 = `000000000000000000`;

describe("PegStability", () => {
    let owner: SignerWithAddress;
    let treasury: SignerWithAddress;
    let other: SignerWithAddress;
    let debtToken: FakeContract<IERC20Metadata>;
    let reserveToken: FakeContract<IERC20Metadata>;

    beforeEach(async () => {
        [owner, treasury, other] = await ethers.getSigners();
        debtToken = await smock.fake<IERC20Metadata>("IERC20Metadata");
        reserveToken = await smock.fake<IERC20Metadata>("IERC20Metadata");
    });

    describe("constructor", () => {
        it("can construct", async () => {
            let psm = await new PegStability__factory(owner).deploy(
                debtToken.address,
                reserveToken.address,
                250, // 0.25%
                450, // 0.45%
                treasury.address
            );

            expect(await psm.debtToken()).to.equal(debtToken.address);
            expect(await psm.reserveToken()).to.equal(reserveToken.address);
            expect(await psm.buyFee()).to.equal(250);
            expect(await psm.sellFee()).to.equal(450);
            expect(await psm.treasury()).to.equal(treasury.address);
        });

        it("reverts on zero debt token address", async () => {
            await expect(new PegStability__factory(owner).deploy(
                ethers.constants.AddressZero,
                reserveToken.address,
                250, // 0.25%
                450, // 0.45%
                treasury.address
            )).to.be.revertedWith("0x0 debt token");
        });

        it("reverts on zero reserve token address", async () => {
            await expect(new PegStability__factory(owner).deploy(
                debtToken.address,
                ethers.constants.AddressZero,
                250, // 0.25%
                450, // 0.45%
                treasury.address
            )).to.be.revertedWith("0x0 reserve token");
        });

        it("reverts on zero treasury address", async () => {
            await expect(new PegStability__factory(owner).deploy(
                debtToken.address,
                reserveToken.address,
                250, // 0.25%
                450, // 0.45%
                ethers.constants.AddressZero
            )).to.be.revertedWith("0x0 treasury");
        });
    });

    context("post-construction", () => {
        let psm: PegStability;
        beforeEach(async () => {
            psm = await new PegStability__factory(owner).deploy(
                debtToken.address,
                reserveToken.address,
                250, // 0.25%
                450, // 0.45%
                treasury.address
            );
        });

        describe("buy", () => {
            it("transfers debt token to msg.sender", async () => {
                debtToken.transfer.returns(true);
                debtToken.balanceOf.returns(`1000000${E18}`);
                reserveToken.transferFrom.returns(true);

                const AMOUNT = `10000${E18}`;

                await psm.connect(other).buy(AMOUNT);

                expect(debtToken.transfer).to.be.calledWith(other.address, AMOUNT);
            });

            it("transfers reserve tokens, plus fees from msg.sender", async () => {
                debtToken.transfer.returns(true);
                debtToken.balanceOf.returns(`1000000${E18}`);
                reserveToken.transferFrom.returns(true);

                const AMOUNT = `10000${E18}`;

                await psm.connect(other).buy(AMOUNT);

                expect(reserveToken.transferFrom).to.be.calledWith(other.address, psm.address, `10025${E18}`);
                expect(await psm.feesCollected()).to.equal(`25${E18}`);
            });

            it("emits a ReserveBought event", async () => {
                debtToken.transfer.returns(true);
                debtToken.balanceOf.returns(`1000000${E18}`);
                reserveToken.transferFrom.returns(true);

                const AMOUNT = `10000${E18}`;

                await expect(psm.connect(other).buy(AMOUNT)).
                    to.emit(psm, "ReservesBought").withArgs(AMOUNT);
            });

            it("reverts if debt token balance is less than amount and fees previously collected", async () => {
                debtToken.transfer.returns(true);
                debtToken.balanceOf.returns(`10000${E18}`);
                reserveToken.transferFrom.returns(true);

                const AMOUNT = `10000${E18}`;
                await psm.connect(other).buy(AMOUNT);
                expect(await psm.feesCollected()).to.equal(`25${E18}`);

                await expect(psm.connect(other).buy(AMOUNT)).
                    to.be.revertedWith("insufficient balance")
            });

            it("reverts if debt token balance is less than amount", async () => {
                debtToken.transfer.returns(true);
                debtToken.balanceOf.returns(`100${E18}`);
                reserveToken.transferFrom.returns(true);

                const AMOUNT = `10000${E18}`;

                await expect(psm.connect(other).buy(AMOUNT)).
                    to.be.revertedWith("insufficient balance")
            });
        });

        describe("sell", () => {
            it("transfers reserve tokens to msg.sender", async () => {
                debtToken.transferFrom.returns(true);
                reserveToken.transfer.returns(true);

                const AMOUNT = `50000${E18}`;

                await psm.connect(other).sell(AMOUNT);

                expect(reserveToken.transfer).to.be.calledWith(other.address, AMOUNT)
            });

            it("transfers debt tokens plus fees from msg.sender", async () => {
                debtToken.transferFrom.returns(true);
                reserveToken.transfer.returns(true);

                const AMOUNT = `50000${E18}`;

                await psm.connect(other).sell(AMOUNT);

                expect(debtToken.transferFrom).to.be.calledWith(other.address, psm.address, `50225${E18}`)
                expect(await psm.feesCollected()).to.equal(`225${E18}`);
            });

            it("emits a reserves sold event", async () => {
                debtToken.transferFrom.returns(true);
                reserveToken.transfer.returns(true);

                const AMOUNT = `50000${E18}`;

                await expect(psm.connect(other).sell(AMOUNT)).
                    to.emit(psm, "ReservesSold").withArgs(AMOUNT);
            });
        });

        describe("withdrawReserves", () => {
            it("transfers reserves to owner", async () => {
                reserveToken.transfer.returns(true);

                const AMOUNT = `100${E18}`;
                await psm.connect(owner).withdrawReserves(AMOUNT);

                expect(reserveToken.transfer).to.be.calledWith(owner.address, AMOUNT);
            });

            it("emits a reserves withdrawn event", async () => {
                reserveToken.transfer.returns(true);

                const AMOUNT = `100${E18}`;
                await expect(psm.connect(owner).withdrawReserves(AMOUNT)).
                    to.emit(psm, "ReservesWithdrawn").withArgs(AMOUNT);
            });

            it("reverts if amount is zero", async () => {
                await expect(psm.connect(owner).withdrawReserves(0)).
                    to.be.revertedWith("zero withdraw");
            });

            it("reverts if not owner", async () => {
                await expect(psm.connect(other).withdrawReserves(1)).
                    to.be.revertedWith("Ownable: caller is not the owner");
            });
        });

        describe("withdrawDebtTokens", () => {
            it("transfers debt tokens to owner", async () => {
                debtToken.transfer.returns(true);

                const AMOUNT = `100${E18}`;
                await psm.connect(owner).withdrawDebtTokens(AMOUNT);

                expect(debtToken.transfer).to.be.calledWith(owner.address, AMOUNT);
            });

            it("emits a debt tokens withdrawn event", async () => {
                debtToken.transfer.returns(true);

                const AMOUNT = `100${E18}`;
                await expect(psm.connect(owner).withdrawDebtTokens(AMOUNT)).
                    to.emit(psm, "DebtTokensWithdrawn").withArgs(AMOUNT);
            });

            it("reverts if amount is zero", async () => {
                await expect(psm.connect(owner).withdrawDebtTokens(0)).
                    to.be.revertedWith("zero withdraw");
            });

            it("reverts if not owner", async () => {
                await expect(psm.connect(other).withdrawDebtTokens(1)).
                    to.be.revertedWith("Ownable: caller is not the owner");
            });
        });

        describe("setBuyFee", () => {
            it("updates the buy fee", async () => {
                await psm.connect(owner).setBuyFee(1000);
                expect(await psm.buyFee()).to.equal(1000)
            })

            it("can only be done by the owner", async () => {
                await expect(psm.connect(other).setBuyFee(1000)).
                    to.be.revertedWith("Ownable: caller is not the owner");
            })
        });

        describe("setSellFee", () => {
            it("updates the sell fee", async () => {
                await psm.connect(owner).setSellFee(1000);
                expect(await psm.sellFee()).to.equal(1000)
            })

            it("can only be done by the owner", async () => {
                await expect(psm.connect(other).setSellFee(1000)).
                    to.be.revertedWith("Ownable: caller is not the owner");
            })
        });

        describe("harvestFees", () => {
            it("transfers fees to the treasury", async () => {
                debtToken.transferFrom.returns(true);
                debtToken.transfer.returns(true);
                reserveToken.transfer.returns(true);

                const AMOUNT = `50000${E18}`;
                const FEES = `225${E18}`;

                await psm.connect(other).sell(AMOUNT);
                
                expect(await psm.feesCollected()).to.equal(FEES);

                await psm.harvestFees();

                expect(await psm.feesCollected()).to.equal(0);
                expect(debtToken.transfer).to.be.calledWith(treasury.address, FEES);
            });
        });


        describe("recoverERC20", () => {
            it("transfer random ERC20 tokens to the owner", async () => {
                let token = await smock.fake<IERC20>("IERC20");
                token.transfer.returns(true);
                await psm.connect(owner).recoverERC20(token.address, 100);
                expect(token.transfer).to.be.calledWith(owner.address, 100);
            });

            it("cannot recover debt token", async () => {
                await expect(psm.connect(owner).recoverERC20(debtToken.address, 100)).
                    to.be.revertedWith("Cannot recover debt tokens");
            });

            it("cannot recover reserve token", async () => {
                await expect(psm.connect(owner).recoverERC20(reserveToken.address, 100)).
                    to.be.revertedWith("Cannot recover reserve tokens");
            });

            it("can only be done by the owner", async () => {
                let token = await smock.fake<IERC20>("IERC20");
                await expect(psm.connect(other).recoverERC20(token.address, 100)).
                    to.be.revertedWith("Ownable: caller is not the owner");
            });
        });
    });
});