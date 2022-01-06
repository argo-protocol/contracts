import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { DebtToken, DebtToken__factory } from "../typechain";
import { expect } from "chai";
import { ethers } from "hardhat";

describe("DebtToken", () => {
    let owner: SignerWithAddress;
    let other: SignerWithAddress;

    beforeEach(async () => {
        [owner, other] = await ethers.getSigners();
    });

    describe("constructor", () => {
        it("sets the constants", async () => {
            const token = await (new DebtToken__factory(owner)).deploy();

            expect(await token.name()).to.equal("SIN USD");
            expect(await token.symbol()).to.equal("SIN");
            expect(await token.decimals()).to.equal(18);
            expect(await token.totalSupply()).to.equal(0);
        });
    });

    describe("post-construction", () => {
        let token: DebtToken;
        beforeEach(async () => {
            token = await (new DebtToken__factory(owner)).deploy();
        });

        describe("mint", () => {
            it("mints the amount to the to address", async () => {
                await token.connect(owner).mint(other.address, 1234);

                expect(await token.balanceOf(other.address)).to.equal(1234);
                expect(await token.totalSupply()).to.equal(1234);
            });

            it("can only be done by the owner", async () => {
                await expect(token.connect(other).mint(other.address, 1234)).
                    to.be.revertedWith("Ownable: caller is not the owner");
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
                await expect(token.connect(other).burn(1235)).
                    to.be.revertedWith("ERC20: burn amount exceeds balance");
            });
        });
    });
});