import { FakeContract, smock } from "@defi-wonderland/smock";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import chai, { expect } from "chai";
import { ethers } from "hardhat";
import { IDebtToken, IERC20, LayerZeroController, LayerZeroController__factory } from "../typechain";
import { ILayerZeroEndpoint } from "../typechain/ILayerZeroEndpoint";

chai.use(smock.matchers);

context("LayerZeroController", () => {
    const REMOTE_CHAIN = 1020;
    const REMOTE_ADDR = "0x90f79bf6eb2c4f870365e785982e1f101e93b906";
    const QTY = 1000;

    let owner: SignerWithAddress;
    let other: SignerWithAddress;
    let endpoint: FakeContract<ILayerZeroEndpoint>;
    let token: FakeContract<IDebtToken>;
    let controller: LayerZeroController;

    beforeEach(async () => {
        [owner, other] = await ethers.getSigners();

        endpoint = await smock.fake<ILayerZeroEndpoint>("ILayerZeroEndpoint");
        token = await smock.fake<IDebtToken>("IDebtToken");
        controller = await new LayerZeroController__factory(owner).deploy(token.address);
    });

    describe("not enabled", () => {
        it("reverts when sending", async () => {
            await expect(controller.connect(other).sendTokens(REMOTE_CHAIN, REMOTE_ADDR, QTY)).to.be.revertedWith(
                "LZC: disabled"
            );
        });

        it("reverts when receiving", async () => {
            await expect(
                controller
                    .connect(endpoint.wallet)
                    .lzReceive(REMOTE_CHAIN, REMOTE_ADDR, 0, ethers.utils.defaultAbiCoder.encode([], []))
            ).to.be.revertedWith("LZC: disabled");
        });
    });

    describe("enabled", () => {
        beforeEach(async () => {
            await controller.setLayerZeroEndpoint(endpoint.address);
        });

        describe("sendTokens", () => {
            it("reverts if allowance is low", async () => {
                token.allowance.returns(QTY - 1);

                await expect(controller.connect(other).sendTokens(REMOTE_CHAIN, REMOTE_ADDR, QTY)).revertedWith(
                    "LZC: low allowance"
                );
            });

            it("reverts if transfer returns false", async () => {
                token.allowance.returns(QTY);
                token.transferFrom.returns(false);

                await expect(controller.connect(other).sendTokens(REMOTE_CHAIN, REMOTE_ADDR, QTY)).revertedWith(
                    "LZC: transfer fail"
                );
            });

            it("sends to endpoint", async () => {
                token.allowance.returns(QTY);
                token.transferFrom.returns(true);

                await controller.connect(other).sendTokens(REMOTE_CHAIN, REMOTE_ADDR, QTY);

                expect(token.transferFrom).to.be.calledWith(other.address, controller.address, QTY);
                expect(token.burn).to.be.calledWith(QTY);

                const expectedPayload = ethers.utils.defaultAbiCoder.encode(
                    ["address", "uint256"],
                    [other.address, QTY]
                );
                expect(endpoint.send).to.be.calledWith(
                    REMOTE_CHAIN,
                    REMOTE_ADDR,
                    expectedPayload,
                    other.address,
                    ethers.constants.AddressZero,
                    "0x"
                );
            });
        });

        describe("setLZRemote", () => {
            it("requires owner", async () => {
                await expect(
                    controller.connect(other).setLayerZeroRemote(REMOTE_CHAIN, REMOTE_ADDR)
                ).to.be.revertedWith("Ownable: caller is not the owner");
            });
            it("owner can set key-value", async () => {
                await controller.setLayerZeroRemote(REMOTE_CHAIN, REMOTE_ADDR);
                expect(await controller.remotes(REMOTE_CHAIN)).to.eq(REMOTE_ADDR);
            });
            it("owner can set repeatedly", async () => {
                await controller.setLayerZeroRemote(REMOTE_CHAIN, REMOTE_ADDR);
                await expect(controller.setLayerZeroRemote(REMOTE_CHAIN, REMOTE_ADDR)).not.to.be.reverted;
            });
        });

        describe("lzReceive", () => {
            let payload: string;
            beforeEach(async () => {
                payload = ethers.utils.defaultAbiCoder.encode(["address", "uint256"], [other.address, QTY]);
                // fund the endpoint contract
                await owner.sendTransaction({
                    to: endpoint.address,
                    value: ethers.utils.parseEther("1.0"),
                });
            });
            it("reverts if not called by endpoint", async () => {
                await expect(controller.lzReceive(REMOTE_CHAIN, REMOTE_ADDR, 0, payload)).to.be.revertedWith(
                    "LZC: lzReceive bad sender"
                );
            });
            it("reverts if remote not set", async () => {
                await expect(
                    controller.connect(endpoint.wallet).lzReceive(REMOTE_CHAIN, REMOTE_ADDR, 0, payload)
                ).to.be.revertedWith("LZC: lzReceive bad remote");
            });
            it("reverts if called with incorrect remote address", async () => {
                await controller.setLayerZeroRemote(REMOTE_CHAIN, REMOTE_ADDR);
                await expect(
                    controller.connect(endpoint.wallet).lzReceive(REMOTE_CHAIN, other.address, 0, payload)
                ).to.be.revertedWith("LZC: lzReceive bad remote");
            });
            it("mints payload amount to payload address", async () => {
                await controller.setLayerZeroRemote(REMOTE_CHAIN, REMOTE_ADDR);
                await controller.connect(endpoint.wallet).lzReceive(REMOTE_CHAIN, REMOTE_ADDR, 0, payload);
                expect(token.mint).to.be.calledWith(other.address, QTY);
            });
            it("receives even if owner is renounced", async () => {
                await controller.setLayerZeroRemote(REMOTE_CHAIN, REMOTE_ADDR);
                await controller.renounceOwnership();
                await controller.connect(endpoint.wallet).lzReceive(REMOTE_CHAIN, REMOTE_ADDR, 0, payload);
                expect(token.mint).to.be.calledWith(other.address, QTY);
            });
        });
    });

    describe("recoverERC20", () => {
        it("transfer random ERC20 tokens to the owner", async () => {
            let someToken = await smock.fake<IERC20>("IERC20");
            someToken.transfer.returns(true);
            await controller.recoverERC20(someToken.address, 100);
            expect(someToken.transfer).to.be.calledWith(owner.address, 100);
        });

        it("cannot recover LZC token", async () => {
            await expect(controller.recoverERC20(token.address, 100)).to.be.revertedWith(
                "LZC: Cannot recover LZC token"
            );
        });

        it("non-owner cannot recover tokens", async () => {
            let someToken = await smock.fake<IERC20>("IERC20");
            someToken.transfer.returns(true);
            await expect(controller.connect(other).recoverERC20(someToken.address, 100)).to.be.revertedWith(
                "Ownable: caller is not the owner"
            );
        });
    });
});
